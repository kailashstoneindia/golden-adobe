import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Test, TestingModule } from '@nestjs/testing';
import ExcelJS from 'exceljs';

import { catalogFixtures } from './catalog-fixtures';
import { CATALOG_TEST_MODELS } from './test-db';
import { AdminCatalogService } from '../admin-catalog.service';
import { BrandResolverService } from '../brand-resolver.service';
import { CatalogAttributeResolverService } from '../catalog-attribute-resolver.service';
import { CatalogImportJobsService, IMPORT_JOB_QUEUE } from '../catalog-import-jobs.service';
import { CatalogImportUploadService } from '../catalog-import-upload.service';
import { MediaService } from '../media/media.service';
import { MEDIA_STORAGE_CONFIG, OBJECT_STORAGE } from '../media/object-storage';
import { CatalogImportJob } from '../models/catalog-import-job.model';
import { MasterProduct } from '../models/master-product.model';
import { VendorListing } from '../models/vendor-listing.model';
import { ProductReadinessService } from '../product-readiness.service';
import { User } from '../../users/models/user.model';

// Decision 0063 / S7 Task 2: imports run as background jobs with history,
// an error workbook and undo. The queue and object storage are stand-ins;
// the rows, products and jobs are real.
describe('CatalogImportJobsService (integration)', () => {
  let moduleRef: TestingModule;
  let service: CatalogImportJobsService;
  const suffix = `ij${Date.now()}`;
  const fx = catalogFixtures(suffix);
  let categoryId: string;
  let groupId: string;
  let adminId: string;
  let brandName: string;
  const objects = new Map<string, Buffer>();
  const storage = {
    put: jest.fn(async (key: string, body: Buffer) => {
      objects.set(key, body);
    }),
    get: jest.fn(async (key: string) => objects.get(key)!),
    presignGet: jest.fn(async (key: string) => `https://signed.test/${key}`),
  };
  const queue = { add: jest.fn(async () => ({})) };
  const media = { listForProduct: async () => [], remove: jest.fn(async () => undefined) };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        SequelizeModule.forRoot({
          dialect: 'postgres',
          host: process.env.TEST_DB_HOST ?? '127.0.0.1',
          port: Number(process.env.TEST_DB_PORT ?? 5432),
          username: process.env.TEST_DB_USER ?? 'postgres',
          password: process.env.TEST_DB_PASS ?? 'postgres',
          database: process.env.TEST_DB_NAME ?? 'golden_abode_test',
          logging: false,
          models: CATALOG_TEST_MODELS,
        }),
        SequelizeModule.forFeature(CATALOG_TEST_MODELS),
      ],
      providers: [
        CatalogImportJobsService,
        CatalogImportUploadService,
        AdminCatalogService,
        ProductReadinessService,
        CatalogAttributeResolverService,
        BrandResolverService,
        { provide: MediaService, useValue: media },
        { provide: OBJECT_STORAGE, useValue: storage },
        { provide: MEDIA_STORAGE_CONFIG, useValue: { enabled: true } },
        { provide: IMPORT_JOB_QUEUE, useValue: queue },
      ],
    }).compile();
    service = moduleRef.get(CatalogImportJobsService);

    categoryId = (await fx.category()).id;
    groupId = (await fx.category()).id;
    await (
      await import('../models/category.model')
    ).Category.update({ isLeaf: false } as never, { where: { id: groupId } });
    brandName = (await fx.brand('Imp')).name;
    adminId = fx.track(
      User,
      await User.create({
        name: `IJ Admin ${suffix}`,
        phone: `+91${String(Date.now()).slice(-10)}`,
        role: 'ADMIN',
      } as never),
    ).id;
  });

  afterAll(async () => {
    const ids = (await MasterProduct.findAll({ where: { categoryId }, attributes: ['id'] })).map(
      (p) => p.id,
    );
    await VendorListing.destroy({ where: { masterProductId: ids } });
    await MasterProduct.destroy({ where: { categoryId } });
    await CatalogImportJob.destroy({ where: { createdBy: adminId } });
    await fx.cleanup();
    await moduleRef.close();
  });

  beforeEach(() => jest.clearAllMocks());

  let n = 0;
  // Rows: [name, brand, mpn]; a row with brand "Nobody" is rejected.
  async function workbook(rows: [string, string, string][]) {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Products');
    sheet.addRow(['name*', 'brand*', 'mfr_part_number', 'gst_rate*', 'country_of_origin*']);
    rows.forEach(([name, brand, mpn]) => sheet.addRow([name, brand, mpn, 18, 'India']));
    return Buffer.from(await book.xlsx.writeBuffer());
  }
  const row = (brand = brandName): [string, string, string] => {
    n += 1;
    return [`IJ Product ${n} ${suffix}`, brand, `IJ-${n}-${suffix}`];
  };
  const reload = async (id: string) => (await CatalogImportJob.findByPk(id))!;
  const productsOf = (jobId: string) => MasterProduct.count({ where: { importJobId: jobId } });

  it('enqueue stores the file, records a queued job and adds it to the queue', async () => {
    const buffer = await workbook([row()]);

    const { jobId } = await service.enqueue(adminId, categoryId, buffer);

    expect(storage.put).toHaveBeenCalledWith(
      `imports/${jobId}.xlsx`,
      buffer,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(await reload(jobId)).toMatchObject({
      status: 'queued',
      categoryId,
      createdBy: adminId,
      fileKey: `imports/${jobId}.xlsx`,
    });
    expect(queue.add).toHaveBeenCalledWith('import', { jobId }, expect.objectContaining({ jobId }));
  });

  it('enqueue refuses (400) a category that is not a leaf', async () => {
    await expect(service.enqueue(adminId, groupId, await workbook([row()]))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('a run imports the rows, records counts and progress, and stores the rejected rows', async () => {
    const { jobId } = await service.enqueue(
      adminId,
      categoryId,
      await workbook([row(), row(), row(`Nobody${suffix}`)]),
    );

    await service.run(jobId);

    const job = await reload(jobId);
    expect(job).toMatchObject({
      status: 'done',
      totalRows: 3,
      processedRows: 3,
      acceptedCount: 2,
      rejectedCount: 1,
      errorFileKey: `imports/${jobId}-errors.xlsx`,
    });
    expect(job.finishedAt).toBeInstanceOf(Date);
    expect(objects.has(`imports/${jobId}-errors.xlsx`)).toBe(true);
    expect(await productsOf(jobId)).toBe(2);
  });

  it('a corrupt file fails the job with a readable message and creates nothing', async () => {
    const { jobId } = await service.enqueue(adminId, categoryId, Buffer.from('not a workbook'));

    await service.run(jobId);

    expect(await reload(jobId)).toMatchObject({
      status: 'failed',
      failureMessage: 'The file could not be read as an Excel workbook (.xlsx)',
    });
    expect(await productsOf(jobId)).toBe(0);
    // The admin screen shows why (decision 0063, S8).
    expect((await service.get(jobId)).failureMessage).toBe(
      'The file could not be read as an Excel workbook (.xlsx)',
    );
  });

  it('running a finished job again does nothing', async () => {
    const { jobId } = await service.enqueue(adminId, categoryId, await workbook([row()]));
    await service.run(jobId);

    await service.run(jobId);

    expect(await productsOf(jobId)).toBe(1);
    expect(storage.get).toHaveBeenCalledTimes(1);
  });

  it('a job resumed after a restart does not duplicate products it already created', async () => {
    const { jobId } = await service.enqueue(adminId, categoryId, await workbook([row(), row()]));
    await service.run(jobId);
    await CatalogImportJob.update({ status: 'running', finishedAt: null } as never, {
      where: { id: jobId },
    });

    await service.run(jobId);

    expect(await productsOf(jobId)).toBe(2);
    expect(await reload(jobId)).toMatchObject({
      status: 'done',
      acceptedCount: 0,
      rejectedCount: 2,
    });
  });

  it('gives a download link for the rejected rows, or 404 when there are none', async () => {
    const clean = await service.enqueue(adminId, categoryId, await workbook([row()]));
    await service.run(clean.jobId);
    await expect(service.getErrorDownloadUrl(clean.jobId)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    const bad = await service.enqueue(
      adminId,
      categoryId,
      await workbook([row(`Nobody${suffix}`)]),
    );
    await service.run(bad.jobId);
    expect(await service.getErrorDownloadUrl(bad.jobId)).toEqual({
      url: `https://signed.test/imports/${bad.jobId}-errors.xlsx`,
    });
  });

  it('lists jobs newest first with who started them and the category path', async () => {
    const { jobId } = await service.enqueue(adminId, categoryId, await workbook([row()]));

    const page = await service.list({ page: 1, limit: 50 });

    expect(page.items[0]).toMatchObject({
      id: jobId,
      status: 'queued',
      createdByName: `IJ Admin ${suffix}`,
      hasErrorFile: false,
      undone: false,
    });
    expect(page.items[0].categoryPath).toContain('fx-cat-');
  });

  it('undo deletes the job’s untouched drafts, keeps the rest, and cannot run twice', async () => {
    const { jobId } = await service.enqueue(adminId, categoryId, await workbook([row(), row()]));
    await service.run(jobId);
    const [listed] = await MasterProduct.findAll({ where: { importJobId: jobId } });
    await fx.listing((await fx.vendor()).id, listed.id);

    const result = await service.undo(jobId, adminId);

    expect(result).toEqual({ deleted: 1, kept: 1 });
    expect(await productsOf(jobId)).toBe(1);
    expect((await reload(jobId)).undoneAt).toBeInstanceOf(Date);
    await expect(service.undo(jobId, adminId)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('undo refuses (400) a job that has not finished', async () => {
    const { jobId } = await service.enqueue(adminId, categoryId, await workbook([row()]));

    await expect(service.undo(jobId, adminId)).rejects.toBeInstanceOf(BadRequestException);
  });
});
