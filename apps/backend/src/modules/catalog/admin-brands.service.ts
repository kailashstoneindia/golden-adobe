import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, QueryTypes, UniqueConstraintError, WhereOptions } from 'sequelize';
import type { BrandDto, MergeBrandResultDto, PaginatedResponse } from '@golden-abode/types';

import { Brand } from './models/brand.model';
import { BrandAlias } from './models/brand-alias.model';
import { CatalogMergeLog } from './models/catalog-merge-log.model';
import { MasterProduct } from './models/master-product.model';
import { BrandResolverService } from './brand-resolver.service';
import { CreateBrandDto } from './dto/create-brand.dto';
import { ListBrandsQueryDto } from './dto/list-brands-query.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import {
  MEDIA_STORAGE_CONFIG,
  OBJECT_STORAGE,
  ObjectStorage,
  PresignedPost,
} from './media/object-storage';
import { StorageConfig } from '../../config/storage.config';

const LOGO_CONTENT_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const LOGO_PRESIGN_TTL_SECONDS = 600;
const UUID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

// Decision 0063: brands are created and maintained from the admin panel
// instead of seed scripts. Duplicate detection is the same
// normalize_brand_name() rule as the unique index on brand, checked first so
// the admin gets a message naming the existing brand rather than a raw
// constraint error.
@Injectable()
export class AdminBrandsService {
  constructor(
    @InjectModel(Brand)
    private readonly brandModel: typeof Brand,
    @InjectModel(BrandAlias)
    private readonly brandAliasModel: typeof BrandAlias,
    @InjectModel(MasterProduct)
    private readonly masterProductModel: typeof MasterProduct,
    @InjectModel(CatalogMergeLog)
    private readonly mergeLogModel: typeof CatalogMergeLog,
    private readonly brandResolver: BrandResolverService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(MEDIA_STORAGE_CONFIG) private readonly storageConfig: StorageConfig,
  ) {}

  private get sequelize() {
    return this.brandModel.sequelize!;
  }

  async list(query: ListBrandsQueryDto): Promise<PaginatedResponse<BrandDto>> {
    const limit = Math.min(query.limit ?? 25, 100);
    const page = query.page ?? 1;

    const conditions: WhereOptions[] = [];
    if (query.isActive !== undefined) conditions.push({ isActive: query.isActive });
    const search = query.search?.trim();
    if (search) {
      const pattern = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      const aliasHits = await this.brandAliasModel.findAll({
        attributes: ['brandId'],
        where: { alias: { [Op.iLike]: pattern } },
      });
      conditions.push({
        [Op.or]: [{ name: { [Op.iLike]: pattern } }, { id: aliasHits.map((a) => a.brandId) }],
      });
    }

    const { rows, count } = await this.brandModel.findAndCountAll({
      where: conditions.length ? { [Op.and]: conditions } : {},
      order: [['name', 'ASC']],
      limit,
      offset: (page - 1) * limit,
    });

    return {
      items: await this.toDtos(rows),
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit),
    };
  }

  async get(id: string): Promise<BrandDto> {
    const brand = await this.brandModel.findByPk(id);
    if (!brand) throw new NotFoundException('Brand not found');
    const [dto] = await this.toDtos([brand]);
    return dto;
  }

  async create(dto: CreateBrandDto): Promise<BrandDto> {
    await this.assertNameFree(dto.name);
    const slug = await this.uniqueSlug(dto.name);

    try {
      const brand = await this.brandModel.create({
        name: dto.name,
        slug,
        manufacturerName: dto.manufacturerName,
        manufacturerAddress: dto.manufacturerAddress,
        consumerCareEmail: dto.consumerCareEmail,
        consumerCarePhone: dto.consumerCarePhone,
        isActive: true,
      } as never);
      return this.get(brand.id);
    } catch (err) {
      // Another admin created the same brand between the check and the insert.
      if (err instanceof UniqueConstraintError) {
        throw new ConflictException(`brand "${dto.name}" already exists`);
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateBrandDto): Promise<BrandDto> {
    const brand = await this.findEditable(id);
    if (dto.name !== undefined && dto.name !== brand.name) {
      await this.assertNameFree(dto.name, brand.id);
    }

    const changes: Partial<Brand> = {};
    for (const key of [
      'name',
      'manufacturerName',
      'manufacturerAddress',
      'consumerCareEmail',
      'consumerCarePhone',
    ] as const) {
      if (dto[key] !== undefined) changes[key] = dto[key];
    }

    try {
      await brand.update(changes);
    } catch (err) {
      if (err instanceof UniqueConstraintError) {
        throw new ConflictException(`brand "${dto.name}" already exists`);
      }
      throw err;
    }
    return this.get(id);
  }

  // Deactivating hides a brand from pickers and refuses it on import and
  // add-product; its existing products are left as they are.
  async setActive(id: string, isActive: boolean): Promise<BrandDto> {
    const brand = await this.findOrFail(id);
    if (isActive && brand.mergedIntoId) {
      throw new BadRequestException(
        `brand "${brand.name}" was merged into another brand and can't be reactivated`,
      );
    }
    if (brand.isActive !== isActive) await brand.update({ isActive });
    return this.get(id);
  }

  async addAlias(id: string, text: string): Promise<BrandDto> {
    const brand = await this.findOrFail(id);
    const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');

    const existing = await this.brandAliasModel.findOne({
      where: { alias: normalized },
      include: [Brand],
    });
    if (existing && existing.brandId !== brand.id) {
      throw new ConflictException(
        `alias "${normalized}" already belongs to brand "${existing.brand?.name ?? existing.brandId}"`,
      );
    }

    // Aliases are checked before names, so an alias equal to another brand's
    // name would silently redirect that brand's products here.
    const named = await this.sequelize.query<{ name: string }>(
      `SELECT name FROM brand
        WHERE normalize_brand_name(name) = normalize_brand_name(:text) AND id <> :id
        LIMIT 1`,
      { replacements: { text, id: brand.id }, type: QueryTypes.SELECT },
    );
    if (named.length > 0) {
      throw new ConflictException(`"${text}" is the name of brand "${named[0].name}"`);
    }

    if (!existing) await this.brandResolver.addAlias(brand.id, text);
    return this.get(id);
  }

  async removeAlias(id: string, aliasId: string): Promise<BrandDto> {
    await this.findOrFail(id);
    await this.brandResolver.removeAlias(id, aliasId);
    return this.get(id);
  }

  // Folds a duplicate brand into the one that stays (decision 0063). One
  // transaction with both brand rows locked: products and aliases move, the
  // source's own name becomes an alias of the target, and the source stays
  // as a deactivated pointer so anything still typing its name resolves to
  // the target. A part number present under both brands would break the
  // (brand_id, mfr_part_number) unique index, so that aborts before anything
  // moves and the admin merges those products first.
  async merge(adminUserId: string, fromId: string, intoId: string): Promise<MergeBrandResultDto> {
    if (fromId === intoId) {
      throw new BadRequestException('a brand cannot be merged into itself');
    }

    return this.sequelize.transaction(async (transaction) => {
      // Locked in id order so two opposite merges can't deadlock.
      const locked = await this.brandModel.findAll({
        where: { id: [fromId, intoId] },
        order: [['id', 'ASC']],
        lock: transaction.LOCK.UPDATE,
        transaction,
      });
      const from = locked.find((b) => b.id === fromId);
      const into = locked.find((b) => b.id === intoId);
      if (!from || !into) throw new NotFoundException('Brand not found');
      if (from.mergedIntoId) {
        throw new BadRequestException(`brand "${from.name}" was already merged into another brand`);
      }
      if (!into.isActive) {
        throw new BadRequestException(
          `brand "${into.name}" is deactivated. Activate it before merging into it`,
        );
      }

      const clashes = await this.sequelize.query<{ mfr_part_number: string }>(
        `SELECT s.mfr_part_number
           FROM master_product s
           JOIN master_product t ON t.brand_id = :intoId AND t.mfr_part_number = s.mfr_part_number
          WHERE s.brand_id = :fromId
          ORDER BY s.mfr_part_number`,
        { replacements: { fromId, intoId }, type: QueryTypes.SELECT, transaction },
      );
      if (clashes.length > 0) {
        const mpns = clashes.map((c) => c.mfr_part_number);
        throw new ConflictException(
          `both brands have part number${mpns.length > 1 ? 's' : ''} ${mpns.join(', ')}. Merge or fix those products first`,
        );
      }

      const [movedProducts] = await this.masterProductModel.update(
        { brandId: intoId },
        { where: { brandId: fromId }, transaction },
      );
      const [movedAliases] = await this.brandAliasModel.update(
        { brandId: intoId },
        { where: { brandId: fromId }, transaction },
      );
      const nameAlias = await this.sequelize.query<{ id: string }>(
        `INSERT INTO brand_alias (brand_id, alias) VALUES (:intoId, :alias)
         ON CONFLICT (alias) DO NOTHING RETURNING id`,
        {
          replacements: { intoId, alias: from.name.trim().toLowerCase().replace(/\s+/g, ' ') },
          type: QueryTypes.SELECT,
          transaction,
        },
      );
      const aliasesAdded = movedAliases + nameAlias.length;

      await from.update({ isActive: false, mergedIntoId: intoId }, { transaction });
      await this.mergeLogModel.create(
        {
          entityType: 'brand',
          fromId,
          intoId,
          adminUserId,
          summary: { fromName: from.name, intoName: into.name, movedProducts, aliasesAdded },
        } as never,
        { transaction },
      );

      return { movedProducts, aliasesAdded };
    });
  }

  // Logos go under variants/brands/: the CDN serves only variants/* publicly
  // (infra/aws/s3/media-bucket-policy.json), and the media sweep and the
  // image Lambda only look at .../products/ keys, so a logo there is public
  // and left alone. Uploaded as-is (no resizing); admins upload them.
  async createLogoUploadUrl(
    id: string,
    contentType: string,
  ): Promise<PresignedPost & { key: string }> {
    this.assertStorageEnabled();
    const extension = LOGO_CONTENT_TYPES[contentType];
    if (!extension) {
      throw new BadRequestException('contentType must be image/jpeg, image/png or image/webp');
    }
    await this.findOrFail(id);

    const key = `variants/brands/${id}/logo-${randomUUID()}.${extension}`;
    const post = await this.storage.presignPost({
      key,
      contentType,
      maxBytes: LOGO_MAX_BYTES,
      expiresInSeconds: LOGO_PRESIGN_TTL_SECONDS,
    });
    return { ...post, key };
  }

  async confirmLogo(id: string, key: string): Promise<BrandDto> {
    this.assertStorageEnabled();
    const brand = await this.findOrFail(id);

    // Exactly the shape createLogoUploadUrl mints for this brand, so a caller
    // can't point the logo at another brand's or a product's object.
    const own = new RegExp(`^variants/brands/${id}/logo-${UUID_PATTERN}\\.(jpg|png|webp)$`);
    if (!own.test(key)) {
      throw new BadRequestException("key is not this brand's logo upload");
    }
    if (!(await this.storage.head(key))) {
      throw new BadRequestException('no uploaded object found for this key');
    }

    const base = this.storageConfig.publicBaseUrl.replace(/\/+$/, '');
    await brand.update({ logoUrl: `${base}/${key}` });
    return this.get(id);
  }

  private assertStorageEnabled(): void {
    if (!this.storageConfig.enabled) {
      throw new ServiceUnavailableException('Media storage is not configured on this server');
    }
  }

  private async findOrFail(id: string): Promise<Brand> {
    const brand = await this.brandModel.findByPk(id);
    if (!brand) throw new NotFoundException('Brand not found');
    return brand;
  }

  // A merged brand only exists so its old name keeps resolving; it is not
  // edited any more (decision 0063).
  private async findEditable(id: string): Promise<Brand> {
    const brand = await this.findOrFail(id);
    if (brand.mergedIntoId) {
      throw new BadRequestException(
        `brand "${brand.name}" was merged into another brand and can't be edited`,
      );
    }
    return brand;
  }

  // Same name (after normalize_brand_name) as another brand, or the exact
  // text of another brand's alias. The second matters because the resolver
  // checks aliases first: a brand named like someone else's alias could never
  // be found by its own name. `exceptId` lets a rename keep its own name.
  private async assertNameFree(name: string, exceptId?: string): Promise<void> {
    const clash = await this.sequelize.query<{ name: string }>(
      `SELECT name FROM brand
        WHERE normalize_brand_name(name) = normalize_brand_name(:name)
          AND (:exceptId::uuid IS NULL OR id <> :exceptId::uuid)
        LIMIT 1`,
      { replacements: { name, exceptId: exceptId ?? null }, type: QueryTypes.SELECT },
    );
    if (clash.length > 0) {
      throw new ConflictException(`brand "${clash[0].name}" already exists`);
    }

    const alias = await this.brandAliasModel.findOne({
      where: { alias: name.trim().toLowerCase().replace(/\s+/g, ' ') },
      include: [Brand],
    });
    if (alias && alias.brandId !== exceptId) {
      throw new ConflictException(
        `"${name}" is already an alias of brand "${alias.brand?.name ?? alias.brandId}"`,
      );
    }
  }

  private async uniqueSlug(name: string): Promise<string> {
    const base =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 150) || 'brand';
    const taken = new Set(
      (
        await this.brandModel.findAll({
          attributes: ['slug'],
          where: { slug: { [Op.or]: [base, { [Op.like]: `${base}-%` }] } },
        })
      ).map((b) => b.slug),
    );
    if (!taken.has(base)) return base;
    for (let n = 2; ; n++) {
      if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
    }
  }

  private async toDtos(brands: Brand[]): Promise<BrandDto[]> {
    if (brands.length === 0) return [];
    const ids = brands.map((b) => b.id);

    const counts = await this.sequelize.query<{ brand_id: string; count: string }>(
      `SELECT brand_id, count(*) AS count FROM master_product WHERE brand_id IN (:ids) GROUP BY brand_id`,
      { replacements: { ids }, type: QueryTypes.SELECT },
    );
    const countById = new Map(counts.map((c) => [c.brand_id, Number(c.count)]));

    const aliases = await this.brandAliasModel.findAll({
      where: { brandId: ids },
      order: [['alias', 'ASC']],
    });
    const aliasesById = new Map<string, string[]>();
    for (const a of aliases) {
      aliasesById.set(a.brandId, [...(aliasesById.get(a.brandId) ?? []), a.alias]);
    }

    return brands.map((b) => ({
      id: b.id,
      name: b.name,
      slug: b.slug,
      logoUrl: b.logoUrl,
      manufacturerName: b.manufacturerName,
      manufacturerAddress: b.manufacturerAddress,
      consumerCareEmail: b.consumerCareEmail,
      consumerCarePhone: b.consumerCarePhone,
      isActive: b.isActive,
      mergedIntoId: b.mergedIntoId,
      productCount: countById.get(b.id) ?? 0,
      aliases: aliasesById.get(b.id) ?? [],
    }));
  }
}
