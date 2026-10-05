import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { QueryTypes, Transaction } from 'sequelize';

import type { StorageConfig } from '../../../config/storage.config';
import { MasterProduct } from '../models/master-product.model';
import {
  MasterProductMedia,
  MediaType,
  ProcessingStatus,
} from '../models/master-product-media.model';
import { ConfirmMediaDto } from './dto/confirm-media.dto';
import { CreateMediaUploadDto } from './dto/create-media-upload.dto';
import { MediaProcessingResultDto } from './dto/media-processing-result.dto';
import { ReorderMediaDto } from './dto/reorder-media.dto';
import { UpdateMediaDto } from './dto/update-media.dto';
import { SNIFF_BYTES, sniffImageType } from './image-sniff';
import {
  MEDIA_CONTENT_TYPES,
  MediaContentType,
  VariantName,
  isAllowedContentType,
  originalKey,
  variantKeys,
  variantUrls,
  variantUrlsFromStorageKey,
} from './media-keys';
import { MEDIA_STORAGE_CONFIG, OBJECT_STORAGE, ObjectHead, ObjectStorage } from './object-storage';

// What an admin sees for one image. URLs are derived from the stored key at
// read time (decision 0033), never stored, so a CDN domain change is config.
export type MediaItem = {
  id: string;
  type: MediaType;
  status: ProcessingStatus;
  error: string | null;
  isPrimary: boolean;
  isRepresentative: boolean;
  displayOrder: number;
  contentType: string | null;
  sizeBytes: number | null;
  // Present once the image is usable. External-URL rows repeat their one URL.
  variants: Record<VariantName, string> | null;
  createdAt: string;
};

export type UploadTicket = {
  mediaId: string;
  upload: { url: string; fields: Record<string, string> };
  expiresAt: string;
  maxBytes: number;
};

export type ConfirmResult = { item: MediaItem; created: boolean };

type UploadedOriginal = { key: string; contentType: MediaContentType; head: ObjectHead };

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    @InjectModel(MasterProductMedia)
    private readonly mediaModel: typeof MasterProductMedia,
    @InjectModel(MasterProduct)
    private readonly productModel: typeof MasterProduct,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(MEDIA_STORAGE_CONFIG) private readonly config: StorageConfig,
  ) {}

  private get sequelize() {
    return this.productModel.sequelize!;
  }

  // ── reads ────────────────────────────────────────────────────────────────

  async list(productId: string): Promise<MediaItem[]> {
    await this.requireProduct(productId);
    return this.listForProduct(productId);
  }

  // No existence check: the caller already loaded the product.
  async listForProduct(productId: string): Promise<MediaItem[]> {
    const rows = await this.mediaModel.findAll({
      where: { masterProductId: productId },
      order: [
        ['displayOrder', 'ASC'],
        ['createdAt', 'ASC'],
      ],
    });
    return rows.map((row) => this.toItem(row));
  }

  // ── upload: presign, then confirm ────────────────────────────────────────

  async createUpload(productId: string, dto: CreateMediaUploadDto): Promise<UploadTicket> {
    this.requireEnabled();
    await this.requireProduct(productId);

    if (!isAllowedContentType(dto.contentType)) {
      throw new BadRequestException('contentType must be image/jpeg, image/png or image/webp');
    }
    if (dto.sizeBytes > this.config.maxUploadBytes) {
      throw new BadRequestException(
        `file is too large (max ${Math.floor(this.config.maxUploadBytes / (1024 * 1024))} MB)`,
      );
    }
    const existing = await this.mediaModel.count({ where: { masterProductId: productId } });
    if (existing >= this.config.maxPerProduct) {
      throw new ConflictException(
        `this product already has the maximum of ${this.config.maxPerProduct} images`,
      );
    }

    const mediaId = randomUUID();
    const post = await this.storage.presignPost({
      key: originalKey(productId, mediaId, dto.contentType),
      contentType: dto.contentType,
      maxBytes: this.config.maxUploadBytes,
      expiresInSeconds: this.config.presignTtlSeconds,
    });

    return {
      mediaId,
      upload: post,
      expiresAt: new Date(Date.now() + this.config.presignTtlSeconds * 1000).toISOString(),
      maxBytes: this.config.maxUploadBytes,
    };
  }

  async confirm(productId: string, dto: ConfirmMediaDto): Promise<ConfirmResult> {
    this.requireEnabled();
    const mediaId = dto.mediaId.toLowerCase();

    // Idempotent: a retried confirm returns what the first one created.
    const already = await this.mediaModel.findByPk(mediaId);
    if (already) {
      if (already.masterProductId !== productId) throw new NotFoundException('Upload not found');
      return { item: this.toItem(already), created: false };
    }

    await this.requireProduct(productId);
    const original = await this.findUploadedOriginal(productId, mediaId);
    if (!original) {
      throw new BadRequestException('no uploaded file found for this id (missing or expired)');
    }
    await this.verifyUploadedFile(original);

    return this.sequelize.transaction(async (t) => {
      await this.lockProduct(productId, t);

      // A concurrent confirm for the same id may have won while we validated.
      const raced = await this.mediaModel.findByPk(mediaId, { transaction: t });
      if (raced) return { item: this.toItem(raced), created: false };

      const rows = await this.mediaModel.findAll({
        where: { masterProductId: productId },
        attributes: ['id', 'isPrimary', 'displayOrder'],
        transaction: t,
      });
      if (rows.length >= this.config.maxPerProduct) {
        throw new ConflictException(
          `this product already has the maximum of ${this.config.maxPerProduct} images`,
        );
      }

      const hasPrimary = rows.some((r) => r.isPrimary);
      const makePrimary = dto.isPrimary === true || !hasPrimary;
      if (makePrimary && hasPrimary) await this.clearPrimary(productId, t);

      const created = await this.mediaModel.create(
        {
          id: mediaId,
          masterProductId: productId,
          // Only to satisfy NOT NULL; real URLs are derived from storageKey.
          url: variantUrls(this.config.publicBaseUrl, productId, mediaId).large,
          type: MediaType.IMAGE,
          displayOrder: rows.length ? Math.max(...rows.map((r) => r.displayOrder)) + 1 : 0,
          isPrimary: makePrimary,
          isRepresentative: dto.isRepresentative ?? false,
          storageKey: original.key,
          contentType: original.contentType,
          sizeBytes: original.head.contentLength,
          processingStatus: ProcessingStatus.PROCESSING,
          processingError: null,
          processedAt: null,
          // Model<Self> makes create() demand every Model member; the rest of
          // this module casts create payloads the same way.
        } as any,
        { transaction: t },
      );
      return { item: this.toItem(created), created: true };
    });
  }

  // ── edits ────────────────────────────────────────────────────────────────

  async update(productId: string, mediaId: string, dto: UpdateMediaDto): Promise<MediaItem> {
    if (dto.isPrimary === undefined && dto.isRepresentative === undefined) {
      throw new BadRequestException('nothing to update');
    }
    return this.sequelize.transaction(async (t) => {
      await this.lockProduct(productId, t);
      const row = await this.findOwned(productId, mediaId, t);

      if (dto.isPrimary === false && row.isPrimary) {
        throw new BadRequestException(
          'a product must keep a primary image: make another image primary instead',
        );
      }
      if (dto.isPrimary === true && !row.isPrimary) {
        await this.clearPrimary(productId, t);
        row.isPrimary = true;
      }
      if (dto.isRepresentative !== undefined) row.isRepresentative = dto.isRepresentative;

      await row.save({ transaction: t });
      return this.toItem(row);
    });
  }

  async reorder(productId: string, dto: ReorderMediaDto): Promise<MediaItem[]> {
    const wanted = dto.mediaIds.map((id) => id.toLowerCase());
    await this.sequelize.transaction(async (t) => {
      await this.lockProduct(productId, t);
      const rows = await this.mediaModel.findAll({
        where: { masterProductId: productId },
        attributes: ['id'],
        transaction: t,
      });
      const have = new Set(rows.map((r) => r.id));
      if (wanted.length !== have.size || !wanted.every((id) => have.has(id))) {
        throw new BadRequestException("mediaIds must be exactly this product's media, each once");
      }
      for (const [index, id] of wanted.entries()) {
        await this.mediaModel.update(
          { displayOrder: index },
          { where: { id, masterProductId: productId }, transaction: t },
        );
      }
    });
    return this.listForProduct(productId);
  }

  async remove(productId: string, mediaId: string): Promise<void> {
    const storageKey = await this.sequelize.transaction(async (t) => {
      await this.lockProduct(productId, t);
      const row = await this.findOwned(productId, mediaId, t);
      const wasPrimary = row.isPrimary;
      const key = row.storageKey;
      await row.destroy({ transaction: t });

      if (wasPrimary) {
        const next = await this.mediaModel.findOne({
          where: { masterProductId: productId },
          order: [
            ['displayOrder', 'ASC'],
            ['createdAt', 'ASC'],
          ],
          transaction: t,
        });
        if (next) await next.update({ isPrimary: true }, { transaction: t });
      }
      return key;
    });

    // After commit, so the row is gone whatever happens here. Leftovers are the
    // sweep script's job.
    if (storageKey) {
      try {
        await this.storage.deleteMany([
          storageKey,
          ...Object.values(variantKeys(productId, mediaId)),
        ]);
      } catch (error) {
        this.logger.warn(`Row ${mediaId} deleted but its objects were not: ${String(error)}`);
      }
    }
  }

  async reprocess(productId: string, mediaId: string): Promise<MediaItem> {
    this.requireEnabled();
    const row = await this.findOwned(productId, mediaId);
    if (!row.storageKey) throw new ConflictException('only uploaded images can be reprocessed');
    if (this.toItem(row).status !== ProcessingStatus.FAILED) {
      throw new ConflictException('only a failed image can be reprocessed');
    }

    // Flip to 'processing' BEFORE re-triggering the Lambda: if its callback
    // arrived first it would find a non-processing row and be ignored, leaving
    // the image stuck until the timeout.
    //
    // A static update, not row.update(): a row that timed out is still stored as
    // 'processing', so an instance update sees nothing changed, skips the query
    // and never refreshes updated_at, which is what the timeout is measured from.
    await this.mediaModel.update(
      { processingStatus: ProcessingStatus.PROCESSING, processingError: null, processedAt: null },
      { where: { id: row.id } },
    );
    try {
      await this.storage.copyInPlace(row.storageKey);
    } catch (error) {
      await this.mediaModel.update(
        {
          processingStatus: ProcessingStatus.FAILED,
          processingError: 'the original file is missing: upload the image again',
        },
        { where: { id: row.id } },
      );
      this.logger.warn(`Reprocess of ${mediaId} failed: ${String(error)}`);
      throw new ConflictException('the original file is missing: upload the image again');
    }
    // Reload: the timeout is measured from updated_at, and the instance still
    // holds the stale value from before the status flip.
    await row.reload();
    return this.toItem(row);
  }

  // ── the Lambda's callback ────────────────────────────────────────────────

  // Only ever moves a row OUT of 'processing'. A duplicate or late delivery is a
  // no-op, and an unknown id is a 404 so the Lambda retries: it can finish
  // before the confirm request commits.
  async applyProcessingResult(
    mediaId: string,
    dto: MediaProcessingResultDto,
  ): Promise<{ outcome: 'updated' | 'noop' }> {
    const values =
      dto.status === 'ready'
        ? {
            processingStatus: ProcessingStatus.READY,
            processedAt: new Date(),
            processingError: null,
          }
        : {
            processingStatus: ProcessingStatus.FAILED,
            processingError: dto.reason ?? 'image processing failed',
          };

    const [affected] = await this.mediaModel.update(values, {
      where: { id: mediaId, processingStatus: ProcessingStatus.PROCESSING },
    });
    if (affected > 0) return { outcome: 'updated' };

    const exists = await this.mediaModel.count({ where: { id: mediaId } });
    if (!exists) throw new NotFoundException('Media not found');
    return { outcome: 'noop' };
  }

  // ── internals ────────────────────────────────────────────────────────────

  private requireEnabled(): void {
    if (!this.config.enabled) {
      throw new ServiceUnavailableException('Media storage is not configured on this server');
    }
  }

  private async requireProduct(productId: string): Promise<void> {
    const found = await this.productModel.findByPk(productId, { attributes: ['id'] });
    if (!found) throw new NotFoundException('Product not found');
  }

  // Serialises every media write for one product. The partial unique index
  // idx_mpm_one_primary is the backstop; this lock is what keeps two admins from
  // tripping it.
  private async lockProduct(productId: string, transaction: Transaction): Promise<void> {
    const rows = await this.sequelize.query<{ id: string }>(
      'SELECT id FROM master_product WHERE id = :productId FOR UPDATE',
      { type: QueryTypes.SELECT, replacements: { productId }, transaction },
    );
    if (rows.length === 0) throw new NotFoundException('Product not found');
  }

  private async findOwned(
    productId: string,
    mediaId: string,
    transaction?: Transaction,
  ): Promise<MasterProductMedia> {
    const row = await this.mediaModel.findOne({
      where: { id: mediaId, masterProductId: productId },
      transaction,
    });
    if (!row) throw new NotFoundException('Media not found');
    return row;
  }

  private async clearPrimary(productId: string, transaction: Transaction): Promise<void> {
    await this.mediaModel.update(
      { isPrimary: false },
      { where: { masterProductId: productId, isPrimary: true }, transaction },
    );
  }

  // The extension was fixed at presign time but is not sent back, so the client
  // can never pick the key: try the three possibilities.
  private async findUploadedOriginal(
    productId: string,
    mediaId: string,
  ): Promise<UploadedOriginal | null> {
    const types = Object.keys(MEDIA_CONTENT_TYPES) as MediaContentType[];
    const probed = await Promise.all(
      types.map(async (contentType) => {
        const key = originalKey(productId, mediaId, contentType);
        return { key, contentType, head: await this.storage.head(key) };
      }),
    );
    const found = probed.filter((p): p is UploadedOriginal => p.head !== null);
    if (found.length === 0) return null;
    if (found.length > 1) {
      await this.discard(...found.map((f) => f.key));
      throw new BadRequestException('more than one file was uploaded for this id');
    }
    return found[0];
  }

  // S3 already enforced size and type through the POST policy; this re-checks
  // both and then looks at the bytes themselves, because the declared type is
  // client-supplied. A file that fails is deleted rather than left behind.
  private async verifyUploadedFile({ key, contentType, head }: UploadedOriginal): Promise<void> {
    if (head.contentLength <= 0 || head.contentLength > this.config.maxUploadBytes) {
      await this.discard(key);
      throw new BadRequestException(
        `file is too large (max ${Math.floor(this.config.maxUploadBytes / (1024 * 1024))} MB)`,
      );
    }
    if (head.contentType !== contentType) {
      await this.discard(key);
      throw new BadRequestException('the uploaded file has an unexpected content type');
    }
    const first = await this.storage.readRange(key, 0, SNIFF_BYTES - 1);
    if (sniffImageType(first) !== contentType) {
      await this.discard(key);
      throw new BadRequestException('file is not a valid JPEG, PNG or WebP image');
    }
  }

  private async discard(...keys: string[]): Promise<void> {
    try {
      await this.storage.deleteMany(keys);
    } catch (error) {
      this.logger.warn(`Could not delete rejected upload ${keys.join(', ')}: ${String(error)}`);
    }
  }

  // A row still 'processing' past the timeout is reported as failed. Computed
  // here on read, with no job and no write, so there is no scheduler to run.
  private toItem(row: MasterProductMedia): MediaItem {
    const updatedAt = row.get('updatedAt') as Date;
    const createdAt = row.get('createdAt') as Date;

    let status = row.processingStatus;
    let error = row.processingError;
    if (
      status === ProcessingStatus.PROCESSING &&
      Date.now() - updatedAt.getTime() > this.config.processingTimeoutSeconds * 1000
    ) {
      status = ProcessingStatus.FAILED;
      error = 'processing timed out';
    }

    let variants: Record<VariantName, string> | null = null;
    if (!row.storageKey) {
      variants = { thumb: row.url, medium: row.url, large: row.url };
    } else if (status === ProcessingStatus.READY) {
      variants = variantUrlsFromStorageKey(this.config.publicBaseUrl, row.storageKey);
    }

    return {
      id: row.id,
      type: row.type,
      status,
      error,
      isPrimary: row.isPrimary,
      isRepresentative: row.isRepresentative,
      displayOrder: row.displayOrder,
      contentType: row.contentType,
      sizeBytes: row.sizeBytes,
      variants,
      createdAt: createdAt.toISOString(),
    };
  }
}
