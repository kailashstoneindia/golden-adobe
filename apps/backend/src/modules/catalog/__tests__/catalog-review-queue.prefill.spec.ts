import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Test, TestingModule } from '@nestjs/testing';
import ExcelJS from 'exceljs';

import { catalogFixtures } from './catalog-fixtures';
import { CATALOG_TEST_MODELS } from './test-db';
import { BrandResolverService } from '../brand-resolver.service';
import { VendorCatalogImportService } from '../vendor-catalog-import.service';
import { VendorMatchLadderService } from '../vendor-match-ladder.service';
import { BrandAlias } from '../models/brand-alias.model';
import { CatalogImportBatch } from '../models/catalog-import-batch.model';
import { CatalogImportRow, ImportRowStatus } from '../models/catalog-import-row.model';

// Decision 0063 / S9: a vendor row that matched nothing can become a new
// product. The upload keeps the vendor's product name and brand text, and the
// prefill turns the staged row into a starting point for the add-product form.
describe('Review row prefill (integration)', () => {
  let moduleRef: TestingModule;
  let service: VendorCatalogImportService;
  const suffix = `rq${Date.now()}`;
  const fx = catalogFixtures(suffix);
  let vendorId: string;
  let shopName: string;
  let keeperId: string;
  let keeperName: string;

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
      providers: [VendorCatalogImportService, VendorMatchLadderService, BrandResolverService],
    }).compile();
    service = moduleRef.get(VendorCatalogImportService);

    const vendor = await fx.vendor();
    vendorId = vendor.id;
    shopName = vendor.shopName;
    const keeper = await fx.brand('Keeper');
    keeperId = keeper.id;
    keeperName = keeper.name;
    fx.track(
      BrandAlias,
      await BrandAlias.create({ brandId: keeper.id, alias: `zorvex co ${suffix}` } as never),
    );
    await fx.brand('Merged', {
      mergedIntoId: keeper.id,
      isActive: false,
      name: `ZorvexOld${suffix}`,
    });
  });

  afterAll(async () => {
    const batches = await CatalogImportBatch.findAll({ where: { vendorId } });
    await CatalogImportRow.destroy({ where: { importBatchId: batches.map((b) => b.id) } });
    await CatalogImportBatch.destroy({ where: { vendorId } });
    await fx.cleanup();
    await moduleRef.close();
  });

  let n = 0;
  // Uploads one row that matches nothing and returns its staged import row.
  async function stageRow(brand: string | null, productName: string | null) {
    n += 1;
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Inventory');
    sheet.addRow(['product_code', 'product_name', 'brand', 'vendor_sku', 'price', 'qty_available']);
    sheet.addRow([`ZX-${n}-${suffix}`, productName, brand, `SKU-${n}-${suffix}`, 120, 10]);
    await service.importFile(vendorId, Buffer.from(await book.xlsx.writeBuffer()));
    const rows = await CatalogImportRow.findAll({
      where: { vendorId, status: ImportRowStatus.NEEDS_REVIEW },
      order: [['createdAt', 'DESC']],
    });
    return rows.find((r) => r.rawRowJson.productRef === `ZX-${n}-${suffix}`)!;
  }

  it('keeps the vendor’s product name and brand text on the staged row', async () => {
    const row = await stageRow(`Zorvex Co ${suffix}`, `Zorvex 6A switch ${suffix}`);

    expect(row.rawRowJson).toMatchObject({
      productName: `Zorvex 6A switch ${suffix}`,
      brand: `Zorvex Co ${suffix}`,
    });
  });

  it('prefills the name, brand text, a suggested brand (through an alias), the vendor and its reference', async () => {
    const row = await stageRow(`Zorvex Co ${suffix}`, `Zorvex 6A switch ${suffix}`);

    expect(await service.prefillReviewRow(row.id)).toEqual({
      name: `Zorvex 6A switch ${suffix}`,
      brandText: `Zorvex Co ${suffix}`,
      suggestedBrandId: keeperId,
      suggestedBrandName: keeperName,
      productRef: row.rawRowJson.productRef,
      categoryId: null,
      attributeValues: {},
      vendorName: shopName,
    });
  });

  it('follows a merged brand to the one that stays', async () => {
    const row = await stageRow(`ZorvexOld${suffix}`, null);

    const prefill = await service.prefillReviewRow(row.id);

    expect(prefill.suggestedBrandId).toBe(keeperId);
    // No product name column: the vendor's reference is the best name there is.
    expect(prefill.name).toBe(row.rawRowJson.productRef);
  });

  it('suggests no brand when the text matches none', async () => {
    const row = await stageRow(`Nobody${suffix}`, `Mystery item ${suffix}`);

    expect(await service.prefillReviewRow(row.id)).toMatchObject({
      brandText: `Nobody${suffix}`,
      suggestedBrandId: null,
      suggestedBrandName: null,
    });
  });

  it('refuses an unknown row (404) and a row already resolved (400)', async () => {
    await expect(
      service.prefillReviewRow('00000000-0000-4000-8000-000000000000'),
    ).rejects.toBeInstanceOf(NotFoundException);

    const row = await stageRow(null, `Done item ${suffix}`);
    await service.resolveReviewRowAsRejected(row.id, 'not stocked');
    await expect(service.prefillReviewRow(row.id)).rejects.toBeInstanceOf(BadRequestException);
  });
});
