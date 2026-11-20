import { TestingModule, Test } from '@nestjs/testing';
import { SequelizeModule } from '@nestjs/sequelize';

import { CATALOG_TEST_MODELS } from './test-db';
import { Category } from '../models/category.model';
import { Brand } from '../models/brand.model';
import { MasterProduct, MasterProductStatus } from '../models/master-product.model';
import { CatalogImportJob } from '../models/catalog-import-job.model';
import { CatalogMergeLog } from '../models/catalog-merge-log.model';
import { User } from '../../users/models/user.model';

// Decision 0063 / S1 Task 1: the onboarding schema (import jobs, merge log,
// merged_into_id on brand and master_product, import_job_id on products).
// Real Postgres so the foreign keys are actually exercised.
describe('Catalog onboarding schema (integration)', () => {
  let moduleRef: TestingModule;
  const suffix = `t${Date.now()}`;
  let categoryId: string;
  let adminId: string;
  const brandIds: string[] = [];

  const makeBrand = async (label: string) => {
    const brand = await Brand.create({
      name: `COS ${label} ${suffix}`,
      slug: `cos-${label.toLowerCase()}-${suffix}`,
      manufacturerName: 'Test',
      manufacturerAddress: 'Test',
      consumerCareEmail: 'care@test.com',
      consumerCarePhone: '+911234567890',
    } as never);
    brandIds.push(brand.id);
    return brand;
  };

  const makeProduct = (label: string) =>
    MasterProduct.create({
      categoryId,
      name: `COS Product ${label} ${suffix}`,
      slug: `cos-product-${label}-${suffix}`,
      isGeneric: true,
      status: MasterProductStatus.DRAFT,
    } as never);

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
      ],
    }).compile();

    const category = await Category.create({
      name: `COS Cat ${suffix}`,
      slug: `cos-cat-${suffix}`,
      level: 1,
      path: `cos-cat-${suffix}`,
      isLeaf: true,
    } as never);
    categoryId = category.id;

    const admin = await User.create({
      name: `COS Admin ${suffix}`,
      phone: `+91${suffix.slice(-10).padStart(10, '6')}`,
      role: 'ADMIN',
    } as never);
    adminId = admin.id;
  });

  afterAll(async () => {
    await MasterProduct.destroy({ where: { categoryId } });
    await CatalogImportJob.destroy({ where: { createdBy: adminId } });
    await CatalogMergeLog.destroy({ where: { adminUserId: adminId } });
    await Brand.update({ mergedIntoId: null } as never, { where: { id: brandIds } });
    await Brand.destroy({ where: { id: brandIds } });
    await Category.destroy({ where: { id: categoryId } });
    await User.destroy({ where: { id: adminId } });
    await moduleRef.close();
  });

  it('saves a queued catalog_import_job and reloads it with zero counters', async () => {
    const job = await CatalogImportJob.create({
      categoryId,
      createdBy: adminId,
      fileKey: `imports/${suffix}.xlsx`,
      status: 'queued',
    } as never);

    const reloaded = await CatalogImportJob.findByPk(job.id);
    expect(reloaded?.status).toBe('queued');
    expect(reloaded?.processedRows).toBe(0);
    expect(reloaded?.totalRows).toBe(0);
    expect(reloaded?.acceptedCount).toBe(0);
    expect(reloaded?.rejectedCount).toBe(0);
    expect(reloaded?.finishedAt).toBeNull();
  });

  it('rejects a catalog_import_job status outside queued|running|done|failed', async () => {
    await expect(
      CatalogImportJob.create({
        categoryId,
        createdBy: adminId,
        fileKey: `imports/${suffix}-bad.xlsx`,
        status: 'paused',
      } as never),
    ).rejects.toThrow();
  });

  it('saves a catalog_merge_log row for a brand merge', async () => {
    const from = await makeBrand('LogFrom');
    const into = await makeBrand('LogInto');

    const log = await CatalogMergeLog.create({
      entityType: 'brand',
      fromId: from.id,
      intoId: into.id,
      adminUserId: adminId,
      summary: { movedProducts: 0 },
    } as never);

    const reloaded = await CatalogMergeLog.findByPk(log.id);
    expect(reloaded?.entityType).toBe('brand');
    expect(reloaded?.summary).toEqual({ movedProducts: 0 });
  });

  it('brand.merged_into_id accepts a real brand and rejects an unknown id', async () => {
    const source = await makeBrand('MergeSrc');
    const target = await makeBrand('MergeTgt');

    await source.update({ mergedIntoId: target.id } as never);
    expect((await Brand.findByPk(source.id))?.mergedIntoId).toBe(target.id);

    await expect(
      source.update({ mergedIntoId: '00000000-0000-4000-8000-000000000000' } as never),
    ).rejects.toThrow(/foreign key/i);
  });

  it('master_product.merged_into_id accepts a real product and rejects an unknown id', async () => {
    const source = await makeProduct('msrc');
    const target = await makeProduct('mtgt');
    const mergedAt = new Date();

    await source.update({ mergedIntoId: target.id, mergedAt } as never);
    const reloaded = await MasterProduct.findByPk(source.id);
    expect(reloaded?.mergedIntoId).toBe(target.id);
    expect(reloaded?.mergedAt?.getTime()).toBe(mergedAt.getTime());

    await expect(
      source.update({ mergedIntoId: '00000000-0000-4000-8000-000000000000' } as never),
    ).rejects.toThrow(/foreign key/i);
  });

  it('master_product.import_job_id accepts a job id', async () => {
    const job = await CatalogImportJob.create({
      categoryId,
      createdBy: adminId,
      fileKey: `imports/${suffix}-link.xlsx`,
      status: 'running',
    } as never);
    const product = await makeProduct('job');

    await product.update({ importJobId: job.id } as never);
    expect((await MasterProduct.findByPk(product.id))?.importJobId).toBe(job.id);
  });
});
