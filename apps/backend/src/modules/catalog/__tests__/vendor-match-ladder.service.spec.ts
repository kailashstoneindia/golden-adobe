import { TestingModule, Test } from '@nestjs/testing';
import { SequelizeModule } from '@nestjs/sequelize';

import { CATALOG_TEST_MODELS } from './test-db';
import { VendorMatchLadderService } from '../vendor-match-ladder.service';
import { BrandResolverService } from '../brand-resolver.service';
import { Category } from '../models/category.model';
import { Brand } from '../models/brand.model';
import { Attribute, AttributeDataType } from '../models/attribute.model';
import { AttributeValueOption } from '../models/attribute-value-option.model';
import { MasterProduct, MasterProductStatus } from '../models/master-product.model';
import { MasterProductAttributeValue } from '../models/master-product-attribute-value.model';
import { VendorProductMap } from '../models/vendor-product-map.model';
import { Vendor } from '../../vendors/models/vendor.model';
import { User } from '../../users/models/user.model';

// Integration tests against real Postgres (see test-db.ts for why). Every
// row is namespaced with a per-suite-run random suffix so parallel test
// runs never collide, and everything created here is torn down in
// afterAll — this suite does not rely on a wrapping transaction rollback
// because the triggers and sequences under test (attributes_flat,
// identity_hash, master_product_code_seq) are exercised more faithfully
// against committed state, the same way the manual E2E testing this suite
// replaces was run.
describe('VendorMatchLadderService (integration)', () => {
  let matcher: VendorMatchLadderService;
  let moduleRef: TestingModule;
  const suffix = `t${Date.now()}`;

  let vendorId: string;
  let categoryId: string;
  let brandId: string;
  let productA: MasterProduct; // matchable by product_code, MPN, GTIN
  let productB: MasterProduct; // distinct variant-defining attributes from A
  let currentAttrId: string;
  let curveAttrId: string;

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
      providers: [VendorMatchLadderService, BrandResolverService],
    }).compile();

    matcher = moduleRef.get(VendorMatchLadderService);

    const user = await User.create({
      name: `Match Ladder Test Vendor ${suffix}`,
      phone: `+91${suffix.slice(-10).padStart(10, '9')}`,
      role: 'VENDOR',
    } as never);
    const vendor = await Vendor.create({
      userId: user.id,
      shopName: `Match Ladder Test Shop ${suffix}`,
      address: 'Test Address',
      latitude: 28.6,
      longitude: 77.2,
    } as never);
    vendorId = vendor.id;

    const category = await Category.create({
      name: `MatchLadderCat ${suffix}`,
      slug: `match-ladder-cat-${suffix}`,
      level: 1,
      path: `match-ladder-cat-${suffix}`,
      isLeaf: true,
    } as never);
    categoryId = category.id;

    const brand = await Brand.create({
      name: `MatchLadderBrand ${suffix}`,
      slug: `match-ladder-brand-${suffix}`,
      manufacturerName: 'Test Manufacturer',
      manufacturerAddress: 'Test Address',
      consumerCareEmail: 'care@test.com',
      consumerCarePhone: '+911234567890',
    } as never);
    brandId = brand.id;

    const currentAttr = await Attribute.create({
      categoryId,
      code: `rated_current_${suffix}`,
      name: 'Rated Current',
      dataType: AttributeDataType.NUMBER,
      unit: 'A',
      isVariantDefining: true,
    } as never);
    currentAttrId = currentAttr.id;

    const curveAttr = await Attribute.create({
      categoryId,
      code: `tripping_curve_${suffix}`,
      name: 'Tripping Curve',
      dataType: AttributeDataType.ENUM,
      isVariantDefining: true,
    } as never);
    curveAttrId = curveAttr.id;
    await AttributeValueOption.create({ attributeId: curveAttr.id, value: 'C' } as never);
    await AttributeValueOption.create({ attributeId: curveAttr.id, value: 'B' } as never);

    productA = await MasterProduct.create({
      categoryId,
      brandId,
      name: `Match Ladder Product A ${suffix}`,
      slug: `match-ladder-product-a-${suffix}`,
      mfrPartNumber: `MPN-A-${suffix}`,
      gtin: `890${suffix.replace(/\D/g, '').slice(0, 10).padStart(10, '0')}`,
      status: MasterProductStatus.LIVE,
    } as never);
    await MasterProductAttributeValue.create({
      masterProductId: productA.id,
      attributeId: currentAttrId,
      value: '32',
    } as never);
    await MasterProductAttributeValue.create({
      masterProductId: productA.id,
      attributeId: curveAttrId,
      value: 'C',
    } as never);

    productB = await MasterProduct.create({
      categoryId,
      brandId,
      name: `Match Ladder Product B ${suffix}`,
      slug: `match-ladder-product-b-${suffix}`,
      mfrPartNumber: `MPN-B-${suffix}`,
      status: MasterProductStatus.LIVE,
    } as never);
    await MasterProductAttributeValue.create({
      masterProductId: productB.id,
      attributeId: currentAttrId,
      value: '16',
    } as never);
    await MasterProductAttributeValue.create({
      masterProductId: productB.id,
      attributeId: curveAttrId,
      value: 'B',
    } as never);
  });

  afterAll(async () => {
    await MasterProductAttributeValue.destroy({
      where: { masterProductId: [productA.id, productB.id] },
    });
    await MasterProduct.destroy({ where: { id: [productA.id, productB.id] } });
    await AttributeValueOption.destroy({ where: { attributeId: [currentAttrId, curveAttrId] } });
    await Attribute.destroy({ where: { id: [currentAttrId, curveAttrId] } });
    await Category.destroy({ where: { id: categoryId } });
    await Brand.destroy({ where: { id: brandId } });
    await VendorProductMap.destroy({ where: { vendorId } });
    const vendor = await Vendor.findByPk(vendorId);
    const userId = vendor?.userId;
    await Vendor.destroy({ where: { id: vendorId } });
    if (userId) await User.destroy({ where: { id: userId } });
    await moduleRef.close();
  });

  it('step 1: matches by exact product_code, auto-matched', async () => {
    const result = await matcher.match({ vendorId, productRef: productA.productCode });
    expect(result.status).toBe('auto_matched');
    expect(result.matchedMasterProductId).toBe(productA.id);
  });

  it('step 2: matches by brand + MPN, case-insensitive brand', async () => {
    const brand = await Brand.findByPk(brandId);
    const result = await matcher.match({
      vendorId,
      productRef: productA.mfrPartNumber!,
      brandName: brand!.name.toUpperCase(),
    });
    expect(result.status).toBe('auto_matched');
    expect(result.matchedMasterProductId).toBe(productA.id);
    expect(result.matchMethod).toBe('mpn');
  });

  it('step 2 negative: wrong brand does not match on MPN alone', async () => {
    const result = await matcher.match({
      vendorId,
      productRef: productA.mfrPartNumber!,
      brandName: 'Some Other Brand Entirely',
    });
    expect(result.matchedMasterProductId).not.toBe(productA.id);
  });

  it('step 3: matches by exact GTIN', async () => {
    const result = await matcher.match({ vendorId, productRef: productA.gtin! });
    expect(result.status).toBe('auto_matched');
    expect(result.matchedMasterProductId).toBe(productA.id);
    expect(result.matchMethod).toBe('gtin');
  });

  it('step 4: structured match discriminates between two products sharing brand+category', async () => {
    const brand = await Brand.findByPk(brandId);
    const resultA = await matcher.match({
      vendorId,
      productRef: 'unrecognizable free text A',
      brandName: brand!.name,
      categoryId,
      attributeValues: {
        [`rated_current_${suffix}`]: '32',
        [`tripping_curve_${suffix}`]: 'C',
      },
    });
    expect(resultA.status).toBe('auto_matched');
    expect(resultA.matchedMasterProductId).toBe(productA.id);

    const resultB = await matcher.match({
      vendorId,
      productRef: 'unrecognizable free text B',
      brandName: brand!.name,
      categoryId,
      attributeValues: {
        [`rated_current_${suffix}`]: '16',
        [`tripping_curve_${suffix}`]: 'B',
      },
    });
    expect(resultB.status).toBe('auto_matched');
    expect(resultB.matchedMasterProductId).toBe(productB.id);
  });

  it('step 4: numeric normalisation treats "32.0" as equal to "32"', async () => {
    const brand = await Brand.findByPk(brandId);
    const result = await matcher.match({
      vendorId,
      productRef: 'unrecognizable free text C',
      brandName: brand!.name,
      categoryId,
      attributeValues: {
        [`rated_current_${suffix}`]: '32.0',
        [`tripping_curve_${suffix}`]: 'C',
      },
    });
    expect(result.status).toBe('auto_matched');
    expect(result.matchedMasterProductId).toBe(productA.id);
  });

  it('step 4: a below-threshold score (only 1 of 2 attributes supplied) does not auto-match', async () => {
    const brand = await Brand.findByPk(brandId);
    const result = await matcher.match({
      vendorId,
      productRef: 'partial attrs',
      brandName: brand!.name,
      categoryId,
      attributeValues: { [`rated_current_${suffix}`]: '32' },
    });
    expect(result.status).toBe('needs_review');
  });

  it('step 5: fuzzy name match NEVER auto-matches, even with a near-exact name', async () => {
    const result = await matcher.match({
      vendorId,
      productRef: `Match Ladder Product A ${suffix} exact wording`,
    });
    expect(result.status).toBe('needs_review');
    expect(result.candidates.length).toBeGreaterThan(0);
  });

  it('step 6: no match at all returns needs_review with empty candidates', async () => {
    const result = await matcher.match({
      vendorId,
      productRef: `zzz totally unrelated text ${suffix} xyzzy`,
    });
    expect(result.status).toBe('needs_review');
    expect(result.candidates).toHaveLength(0);
    expect(result.matchedMasterProductId).toBeNull();
  });

  it('step 0: a confirmed vendor_product_map entry is used and never re-guessed', async () => {
    await VendorProductMap.create({
      vendorId,
      vendorSku: `OWN-SKU-${suffix}`,
      masterProductId: productB.id,
      confirmedBy: 'vendor',
      confirmedAt: new Date(),
    } as never);

    // productRef deliberately points at something that would otherwise
    // resolve to productA via GTIN, proving vendor_product_map wins.
    const result = await matcher.match({
      vendorId,
      productRef: productA.gtin!,
      vendorSku: `OWN-SKU-${suffix}`,
    });
    expect(result.status).toBe('auto_matched');
    expect(result.matchedMasterProductId).toBe(productB.id);
  });

  it('vendorMapKey falls back to productRef when no vendorSku is supplied', async () => {
    const result = await matcher.match({ vendorId, productRef: 'some ref with no sku' });
    expect(result.vendorMapKey).toBe('some ref with no sku');
  });

  it('vendorMapKey uses vendorSku over productRef when both are supplied', async () => {
    const result = await matcher.match({
      vendorId,
      productRef: 'some descriptive text',
      vendorSku: 'MY-OWN-CODE',
    });
    expect(result.vendorMapKey).toBe('MY-OWN-CODE');
  });
});
