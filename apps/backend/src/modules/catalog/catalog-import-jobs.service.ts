import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type { CatalogImportJobDto, PaginatedResponse } from '@golden-abode/types';

import { AdminCatalogService } from './admin-catalog.service';
import { CatalogImportUploadService } from './catalog-import-upload.service';
import { OBJECT_STORAGE, ObjectStorage } from './media/object-storage';
import { CatalogImportJob } from './models/catalog-import-job.model';
import { Category } from './models/category.model';
import { MasterProduct } from './models/master-product.model';
import { User } from '../users/models/user.model';

export const CATALOG_IMPORT_QUEUE = 'catalog-import';

// The BullMQ queue, behind a token so this service (and its tests) never load
// @nestjs/bullmq; CatalogImportJobsModule binds it to the real queue.
export const IMPORT_JOB_QUEUE = Symbol('IMPORT_JOB_QUEUE');
export type ImportJobQueue = {
  add(name: string, data: { jobId: string }, options: Record<string, unknown>): Promise<unknown>;
};
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const ERROR_LINK_SECONDS = 300;

// Decision 0063: the admin product import runs as a background job, so a
// large file no longer holds a web request open. Each upload is a
// catalog_import_job with its history, progress, a rejected-rows workbook and
// an undo. The row rules themselves stay in CatalogImportUploadService.
@Injectable()
export class CatalogImportJobsService {
  private readonly logger = new Logger(CatalogImportJobsService.name);

  constructor(
    @InjectModel(CatalogImportJob)
    private readonly jobModel: typeof CatalogImportJob,
    @InjectModel(Category)
    private readonly categoryModel: typeof Category,
    @InjectModel(MasterProduct)
    private readonly productModel: typeof MasterProduct,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(IMPORT_JOB_QUEUE) private readonly queue: ImportJobQueue,
    private readonly importer: CatalogImportUploadService,
    private readonly catalog: AdminCatalogService,
  ) {}

  async enqueue(adminUserId: string, categoryId: string, file: Buffer): Promise<{ jobId: string }> {
    const category = await this.categoryModel.findByPk(categoryId);
    if (!category) throw new NotFoundException('Category not found');
    if (!category.isLeaf) {
      throw new BadRequestException('Products can only be imported into a leaf category');
    }

    const jobId = randomUUID();
    const fileKey = `imports/${jobId}.xlsx`;
    await this.storage.put(fileKey, file, XLSX);
    await this.jobModel.create({
      id: jobId,
      categoryId,
      createdBy: adminUserId,
      fileKey,
      status: 'queued',
    } as never);
    // BullMQ job id = import job id: adding the same import twice is a no-op.
    await this.queue.add('import', { jobId }, { jobId, removeOnComplete: true, removeOnFail: 100 });
    this.logger.log(`admin ${adminUserId} queued import ${jobId} into ${category.path}`);
    return { jobId };
  }

  // Called by CatalogImportProcessor. A job already finished is left alone, so
  // a redelivered queue message changes nothing. A job found "running" was cut
  // off by a restart: it runs again, and the rows it already saved come back
  // as brand + part number duplicates instead of new products.
  async run(jobId: string): Promise<void> {
    const job = await this.jobModel.findByPk(jobId);
    if (!job) {
      this.logger.warn(`import ${jobId} no longer exists`);
      return;
    }
    if (job.status === 'done' || job.status === 'failed') return;

    await job.update({ status: 'running', processedRows: 0 });
    try {
      const sheet = await this.importer.loadSheet(await this.storage.get(job.fileKey));
      await job.update({ totalRows: Math.max(sheet.actualRowCount - 1, 0) });
      const result = await this.importer.processRows(job.categoryId, sheet, {
        importJobId: job.id,
        onProgress: async (processed) => {
          await job.update({ processedRows: processed });
        },
      });

      let errorFileKey: string | null = null;
      if (result.errorWorkbook) {
        errorFileKey = `imports/${job.id}-errors.xlsx`;
        await this.storage.put(errorFileKey, result.errorWorkbook, XLSX);
      }
      await job.update({
        status: 'done',
        totalRows: result.totalRows,
        processedRows: result.totalRows,
        acceptedCount: result.acceptedCount,
        rejectedCount: result.rejectedCount,
        errorFileKey,
        finishedAt: new Date(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`import ${jobId} failed: ${message}`);
      await job.update({ status: 'failed', failureMessage: message, finishedAt: new Date() });
    }
  }

  async list(query: {
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<CatalogImportJobDto>> {
    const limit = Math.min(query.limit ?? 25, 100);
    const page = query.page ?? 1;
    const { rows, count } = await this.jobModel.findAndCountAll({
      include: [
        { model: Category, attributes: ['path'] },
        { model: User, as: 'creator', attributes: ['name'] },
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset: (page - 1) * limit,
    });
    return {
      items: rows.map((job) => this.toDto(job)),
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit),
    };
  }

  async get(jobId: string): Promise<CatalogImportJobDto> {
    return this.toDto(await this.findWithRelations(jobId));
  }

  async getErrorDownloadUrl(jobId: string): Promise<{ url: string }> {
    const job = await this.findWithRelations(jobId);
    if (!job.errorFileKey) throw new NotFoundException('This import has no rejected rows');
    return { url: await this.storage.presignGet(job.errorFileKey, ERROR_LINK_SECONDS) };
  }

  // Removes what the import created and nothing has touched since: drafts with
  // no listing, order or vendor import row (the same rule as deleting one
  // product). Everything else is kept and counted.
  async undo(jobId: string, adminUserId: string): Promise<{ deleted: number; kept: number }> {
    const job = await this.findWithRelations(jobId);
    if (job.undoneAt) throw new BadRequestException('This import was already undone');
    if (job.status !== 'done' && job.status !== 'failed') {
      throw new BadRequestException('This import has not finished yet');
    }

    const products = await this.productModel.findAll({
      where: { importJobId: jobId },
      attributes: ['id'],
    });
    let deleted = 0;
    for (const product of products) {
      try {
        await this.catalog.deleteProduct(product.id, adminUserId);
        deleted++;
      } catch (error) {
        if (!(error instanceof ConflictException)) throw error;
      }
    }
    await job.update({ undoneAt: new Date() });
    this.logger.log(`admin ${adminUserId} undid import ${jobId}: ${deleted} deleted`);
    return { deleted, kept: products.length - deleted };
  }

  private async findWithRelations(jobId: string): Promise<CatalogImportJob> {
    const job = await this.jobModel.findByPk(jobId, {
      include: [
        { model: Category, attributes: ['path'] },
        { model: User, as: 'creator', attributes: ['name'] },
      ],
    });
    if (!job) throw new NotFoundException('Import not found');
    return job;
  }

  private toDto(job: CatalogImportJob): CatalogImportJobDto {
    return {
      id: job.id,
      categoryId: job.categoryId,
      categoryPath: job.category?.path ?? '',
      status: job.status,
      totalRows: job.totalRows,
      processedRows: job.processedRows,
      acceptedCount: job.acceptedCount,
      rejectedCount: job.rejectedCount,
      hasErrorFile: Boolean(job.errorFileKey),
      createdAt: job.createdAt.toISOString(),
      finishedAt: job.finishedAt ? job.finishedAt.toISOString() : null,
      createdByName: job.creator?.name ?? '',
      undone: Boolean(job.undoneAt),
    };
  }
}
