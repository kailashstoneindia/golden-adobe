import { TestingModule, Test } from '@nestjs/testing';
import { SequelizeModule } from '@nestjs/sequelize';

import { CATALOG_TEST_MODELS } from './test-db';
import { VendorCatalogImportService } from '../vendor-catalog-import.service';
import { VendorMatchLadderService } from '../vendor-match-ladder.service';
import { BrandResolverService } from '../brand-resolver.service';
import { Category } from '../models/category.model';
import { Brand } from '../models/brand.model';
import { MasterProduct, MasterProductStatus } from '../models/master-product.model';
import { VendorListing, VendorListingStatus } from '../models/vendor-listing.model';
import { VendorProductMap } from '../models/vendor-product-map.model';
import { CatalogImportRow, ImportRowStatus } from '../models/catalog-import-row.model';
import { CatalogImportBatch } from '../models/catalog-import-batch.model';
import { Vendor } from '../../vendors/models/vendor.model';
import { User } from '../../users/models/user.model';

// Regression test for a real bug found and fixed this session:
// resolveReviewRowAsLink wrote vendor_product_map keyed on raw.productRef
// (whatever free text identified the product THIS time — a barcode, MPN,
// or plain name, per decision 0011) instead of the vendor's own persistent
// vendor_sku. The practical effect: an admin manually resolving a review
// row would never actually teach the matcher anything useful, because the
// SAME vendor_sku on a future upload would not hit vendor_product_map's
// step-0 lookup, which checks vendor_sku specifically. Caught by asserting
// the map was written under vendor_sku and finding it written under
// productRef instead.
describe('VendorCatalogImportService — vendor_product_map key (integration)', () => {
  let moduleRef: TestingModule;
  let importSvc: VendorCatalogImportService;
  const suffix = `t${Date.now()}`;

  let vendorId: string;
  let categoryId: string;
  let brandId: string;
  let userId: string;

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
    importSvc = moduleRef.get(VendorCatalogImportService);

    const user = await User.create({
      name: `VCI Test Vendor ${suffix}`,
      phone: `+91${suffix.slice(-10).padStart(10, '8')}`,
      role: 'VENDOR',
    } as never);
    userId = user.id;
    const vendor = await Vendor.create({
      userId: user.id,
      shopName: `VCI Test Shop ${suffix}`,
      address: 'Test Address',
      latitude: 28.6,
      longitude: 77.2,
    } as never);
    vendorId = vendor.id;

    const category = await Category.create({
      name: `VCI Test Cat ${suffix}`,
      slug: `vci-test-cat-${suffix}`,
      level: 1,
      path: `vci-test-cat-${suffix}`,
      isLeaf: true,
    } as never);
    categoryId = category.id;

    const brand = await Brand.create({
      name: `VCI Test Brand ${suffix}`,
      slug: `vci-test-brand-${suffix}`,
      manufacturerName: 'Test',
      manufacturerAddress: 'Test',
      consumerCareEmail: 'care@test.com',
      consumerCarePhone: '+911234567890',
    } as never);
    brandId = brand.id;
  });

  afterAll(async () => {
    await VendorProductMap.destroy({ where: { vendorId } });
    await VendorListing.destroy({ where: { vendorId } });
    await CatalogImportRow.destroy({ where: { vendorId } });
    await CatalogImportBatch.destroy({ where: { vendorId } });
    await MasterProduct.destroy({ where: { categoryId } });
    await Category.destroy({ where: { id: categoryId } });
    await Brand.destroy({ where: { id: brandId } });
    await Vendor.destroy({ where: { id: vendorId } });
    await User.destroy({ where: { id: userId } });
    await moduleRef.close();
  });

  it('resolveReviewRowAsLink writes vendor_product_map keyed on vendor_sku, not product_ref', async () => {
    const product = await MasterProduct.create({
      categoryId,
      brandId,
      name: `VCI Resolve Target ${suffix}`,
      slug: `vci-resolve-target-${suffix}`,
      status: MasterProductStatus.LIVE,
    } as never);

    // A row where product_ref (the descriptive text) and vendor_sku (the
    // vendor's own code) are DIFFERENT strings — the exact shape that
    // exposed the bug.
    const batch = await CatalogImportBatch.create({ vendorId, rowCount: 1 } as never);
    const importRow = await CatalogImportRow.create({
      importBatchId: batch.id,
      vendorId,
      rawRowJson: {
        productRef: 'A long descriptive product name the vendor typed once',
        vendorSku: `REAL-VENDOR-SKU-${suffix}`,
        price: 100,
      },
      matchCandidates: [],
      status: ImportRowStatus.NEEDS_REVIEW,
    } as never);

    const listing = await importSvc.resolveReviewRowAsLink(importRow.id, product.id);
    expect(listing.status).toBe(VendorListingStatus.ACTIVE);

    const mapByVendorSku = await VendorProductMap.findOne({
      where: { vendorId, vendorSku: `REAL-VENDOR-SKU-${suffix}` },
    });
    expect(mapByVendorSku).not.toBeNull();
    expect(mapByVendorSku!.masterProductId).toBe(product.id);

    const mapByProductRef = await VendorProductMap.findOne({
      where: { vendorId, vendorSku: 'A long descriptive product name the vendor typed once' },
    });
    expect(mapByProductRef).toBeNull();

    // Clean up in FK order — vendor_listing.master_product_id is
    // ON DELETE RESTRICT, so the listing this test created must go first.
    await VendorProductMap.destroy({ where: { vendorId, masterProductId: product.id } });
    await listing.destroy();
    await product.destroy();
  });

  it('the same vendor_sku resolves via vendor_product_map on a later match call, without re-guessing', async () => {
    const product = await MasterProduct.create({
      categoryId,
      brandId,
      name: `VCI Rematch Target ${suffix}`,
      slug: `vci-rematch-target-${suffix}`,
      status: MasterProductStatus.LIVE,
    } as never);

    await VendorProductMap.create({
      vendorId,
      vendorSku: `REMATCH-SKU-${suffix}`,
      masterProductId: product.id,
      confirmedBy: 'admin',
      confirmedAt: new Date(),
    } as never);

    const matcher = moduleRef.get(VendorMatchLadderService);
    const result = await matcher.match({
      vendorId,
      productRef: 'some completely different descriptive text this time',
      vendorSku: `REMATCH-SKU-${suffix}`,
    });

    expect(result.status).toBe('auto_matched');
    expect(result.matchedMasterProductId).toBe(product.id);

    await product.destroy();
  });
});
