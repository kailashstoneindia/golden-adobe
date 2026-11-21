import { SequelizeModule } from '@nestjs/sequelize';
import { Test, TestingModule } from '@nestjs/testing';
import ExcelJS from 'exceljs';

import { catalogFixtures } from './catalog-fixtures';
import { CATALOG_TEST_MODELS } from './test-db';
import { BrandResolverService } from '../brand-resolver.service';
import { CatalogAttributeResolverService } from '../catalog-attribute-resolver.service';
import { CatalogImportUploadService } from '../catalog-import-upload.service';
import { Attribute, AttributeDataType } from '../models/attribute.model';
import { AttributeValueOption } from '../models/attribute-value-option.model';
import { CatalogImportJob } from '../models/catalog-import-job.model';
import { MasterProduct } from '../models/master-product.model';
import { User } from '../../users/models/user.model';

// Decision 0063 / S7 Task 1: the row loop of the admin import, extracted so the
// background job can run it, stamping each product with its import job.
describe('CatalogImportUploadService.processRows (integration)', () => {
  let moduleRef: TestingModule;
  let service: CatalogImportUploadService;
  const suffix = `ip${Date.now()}`;
  const fx = catalogFixtures(suffix);
  let categoryId: string;
  let brandName: string;
  let jobId: string;
  const HEADERS = [
    'name*',
    'brand*',
    'mfr_part_number',
    'gtin',
    'gst_rate*',
    'country_of_origin*',
    'Finish*',
  ];
  let finishCode: string;

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
        CatalogImportUploadService,
        CatalogAttributeResolverService,
        BrandResolverService,
      ],
    }).compile();
    service = moduleRef.get(CatalogImportUploadService);

    categoryId = (await fx.category()).id;
    finishCode = `finish_${suffix}`;
    const finish = fx.track(
      Attribute,
      await Attribute.create({
        categoryId,
        code: finishCode,
        name: 'Finish',
        dataType: AttributeDataType.ENUM,
        isVariantDefining: true,
      } as never),
    );
    for (const value of ['Matte', 'Gloss']) {
      fx.track(
        AttributeValueOption,
        await AttributeValueOption.create({ attributeId: finish.id, value } as never),
      );
    }
    const brand = await fx.brand('Import');
    brandName = brand.name;
    await fx.product(categoryId, {
      isGeneric: false,
      brandId: brand.id,
      mfrPartNumber: `EXIST-${suffix}`,
    });
    const admin = fx.track(
      User,
      await User.create({
        name: `IP Admin ${suffix}`,
        phone: `+91${String(Date.now()).slice(-10)}`,
        role: 'ADMIN',
      } as never),
    );
    jobId = fx.track(
      CatalogImportJob,
      await CatalogImportJob.create({
        categoryId,
        createdBy: admin.id,
        fileKey: `imports/${suffix}.xlsx`,
        status: 'running',
      } as never),
    ).id;
  });

  afterAll(async () => {
    await MasterProduct.destroy({ where: { categoryId } });
    await fx.cleanup();
    await moduleRef.close();
  });

  // Each row: [name, brand, mpn, gtin, gst, origin, finish]
  const sheetOf = (rows: unknown[][]) => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Products');
    sheet.addRow(HEADERS.map((h) => (h === 'Finish*' ? `${finishCode}*` : h)));
    rows.forEach((row) => sheet.addRow(row));
    return sheet;
  };
  let n = 0;
  const valid = (finish = 'Matte') => {
    n += 1;
    return [`IP Product ${n} ${suffix}`, brandName, `IP-${n}-${suffix}`, null, 18, 'India', finish];
  };

  it('creates drafts for valid rows, stamped with the job, and collects row errors', async () => {
    const result = await service.processRows(
      categoryId,
      sheetOf([
        valid(),
        valid('Shiny'),
        [`IP Unknown ${suffix}`, `Nobody${suffix}`, `IP-U-${suffix}`, null, 18, 'India', 'Matte'],
        [`IP Dup ${suffix}`, brandName, `EXIST-${suffix}`, null, 18, 'India', 'Matte'],
      ]),
      { importJobId: jobId },
    );

    expect(result.acceptedCount).toBe(1);
    expect(result.rejectedCount).toBe(3);
    expect(result.errors.map((e) => [e.row, e.column])).toEqual([
      [3, finishCode],
      [4, 'brand'],
      [5, 'mfr_part_number'],
    ]);
    const created = await MasterProduct.findByPk(result.createdProductIds[0]);
    expect(created).toMatchObject({ importJobId: jobId, status: 'draft' });
    expect(Buffer.isBuffer(result.errorWorkbook)).toBe(true);
  });

  it('reports a row the database refuses as that row’s error and carries on', async () => {
    const tooLongGtin = '9'.repeat(25);
    const bad = valid();
    bad[3] = tooLongGtin;

    const result = await service.processRows(categoryId, sheetOf([valid(), bad, valid()]), {
      importJobId: jobId,
    });

    expect(result.acceptedCount).toBe(2);
    expect(result.rejectedCount).toBe(1);
    expect(result.errors).toEqual([
      expect.objectContaining({
        row: 3,
        message: expect.stringMatching(/^could not save this row/),
      }),
    ]);
  });

  it('reports progress at least every 20 rows and at the end, with no error file when all pass', async () => {
    const progress: number[] = [];
    const rows = Array.from({ length: 45 }, () => valid());

    const result = await service.processRows(categoryId, sheetOf(rows), {
      onProgress: async (processed) => {
        progress.push(processed);
      },
    });

    expect(result.acceptedCount).toBe(45);
    expect(progress).toEqual([20, 40, 45]);
    expect(result.errorWorkbook).toBeNull();
  });
});
