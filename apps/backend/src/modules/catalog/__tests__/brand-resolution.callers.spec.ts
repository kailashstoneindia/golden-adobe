import { BadRequestException } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Test, TestingModule } from '@nestjs/testing';
import ExcelJS from 'exceljs';

import { CATALOG_TEST_MODELS } from './test-db';
import { AdminCatalogService } from '../admin-catalog.service';
import { BrandResolverService } from '../brand-resolver.service';
import { ProductReadinessService } from '../product-readiness.service';
import { CatalogAttributeResolverService } from '../catalog-attribute-resolver.service';
import { CatalogImportUploadService } from '../catalog-import-upload.service';
import { MediaService } from '../media/media.service';
import { Brand } from '../models/brand.model';
import { Category } from '../models/category.model';
import { MasterProduct } from '../models/master-product.model';

// Decision 0063 / S1 Task 2 (review finding 4): the admin import and the
// add-product API used an exact-name lookup, so "havells ltd" or "HAVELLS"
// was rejected although "Havells" exists. Both now resolve through
// BrandResolverService and refuse a deactivated brand.
describe('Brand resolution in admin import and add-product (integration)', () => {
  let moduleRef: TestingModule;
  let importer: CatalogImportUploadService;
  let catalog: AdminCatalogService;
  const suffix = `bc${Date.now()}`;
  let categoryId: string;
  let activeBrand: Brand;
  let inactiveBrand: Brand;
  let rowCounter = 0;

  const brandFields = {
    manufacturerName: 'Test',
    manufacturerAddress: 'Test',
    consumerCareEmail: 'care@test.com',
    consumerCarePhone: '+911234567890',
  };

  // A minimal sheet with only the identity columns: the attribute resolver is
  // stubbed to return no category attributes.
  const workbookWithRow = async (brand: string) => {
    rowCounter += 1;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Products');
    sheet.addRow(['name*', 'brand*', 'mfr_part_number', 'gst_rate*', 'country_of_origin*']);
    sheet.addRow([
      `BC Product ${rowCounter} ${suffix}`,
      brand,
      `BC-${rowCounter}-${suffix}`,
      18,
      'India',
    ]);
    return Buffer.from(await workbook.xlsx.writeBuffer());
  };

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
        AdminCatalogService,
        BrandResolverService,
        ProductReadinessService,
        {
          provide: CatalogAttributeResolverService,
          useValue: { resolveEffectiveAttributes: async () => [] },
        },
        { provide: MediaService, useValue: { listForProduct: async () => [] } },
      ],
    }).compile();
    importer = moduleRef.get(CatalogImportUploadService);
    catalog = moduleRef.get(AdminCatalogService);

    const category = await Category.create({
      name: `BC Cat ${suffix}`,
      slug: `bc-cat-${suffix}`,
      level: 1,
      path: `bc-cat-${suffix}`,
      isLeaf: true,
    } as never);
    categoryId = category.id;

    activeBrand = await Brand.create({
      name: `Volta${suffix}`,
      slug: `volta-${suffix}`,
      ...brandFields,
    } as never);
    inactiveBrand = await Brand.create({
      name: `Retired${suffix}`,
      slug: `retired-${suffix}`,
      isActive: false,
      ...brandFields,
    } as never);
  });

  afterAll(async () => {
    await MasterProduct.destroy({ where: { categoryId } });
    await Brand.destroy({ where: { id: [activeBrand.id, inactiveBrand.id] } });
    await Category.destroy({ where: { id: categoryId } });
    await moduleRef.close();
  });

  describe('import', () => {
    it('accepts a "<brand> ltd" spelling and links the product to the real brand', async () => {
      const result = await importer.importFile(
        categoryId,
        await workbookWithRow(`volta${suffix} ltd`),
      );

      expect(result.errors).toEqual([]);
      expect(result.acceptedCount).toBe(1);
      const product = await MasterProduct.findByPk(result.createdProductIds[0]);
      expect(product?.brandId).toBe(activeBrand.id);
    });

    it('catches a duplicate part number even when the brand is spelled differently', async () => {
      const first = await importer.importFile(categoryId, await workbookWithRow(`Volta${suffix}`));
      expect(first.acceptedCount).toBe(1);
      const product = await MasterProduct.findByPk(first.createdProductIds[0]);

      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Products');
      sheet.addRow(['name*', 'brand*', 'mfr_part_number', 'gst_rate*', 'country_of_origin*']);
      sheet.addRow([
        `BC Dup ${suffix}`,
        `VOLTA${suffix.toUpperCase()}`,
        product!.mfrPartNumber,
        18,
        'India',
      ]);
      const again = await importer.importFile(
        categoryId,
        Buffer.from(await workbook.xlsx.writeBuffer()),
      );

      expect(again.acceptedCount).toBe(0);
      expect(again.errors.map((e) => e.column)).toContain('mfr_part_number');
    });

    it('rejects a deactivated brand with a clear message', async () => {
      const result = await importer.importFile(
        categoryId,
        await workbookWithRow(`Retired${suffix}`),
      );

      expect(result.acceptedCount).toBe(0);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          column: 'brand',
          message: `brand "Retired${suffix}" is deactivated`,
        }),
      );
    });

    it('tells the admin to add an unknown brand on the Brands page', async () => {
      const result = await importer.importFile(
        categoryId,
        await workbookWithRow(`Nobody${suffix}`),
      );

      expect(result.errors).toContainEqual(
        expect.objectContaining({
          column: 'brand',
          message: `brand "Nobody${suffix}" is not in the catalog. Add it on the Brands page first, then re-upload`,
        }),
      );
    });
  });

  describe('createProduct', () => {
    it('accepts an upper-case brand name and links the real brand', async () => {
      const product = await catalog.createProduct({
        categoryId,
        name: `BC Form Product ${suffix}`,
        brand: `VOLTA${suffix.toUpperCase()}`,
        mfrPartNumber: `BC-FORM-${suffix}`,
      });

      expect((await MasterProduct.findByPk(product.id))?.brandId).toBe(activeBrand.id);
    });

    it('refuses a deactivated brand with 400', async () => {
      await expect(
        catalog.createProduct({
          categoryId,
          name: `BC Form Retired ${suffix}`,
          brand: `Retired${suffix}`,
        }),
      ).rejects.toThrow(new BadRequestException(`brand "Retired${suffix}" is deactivated`));
    });
  });
});
