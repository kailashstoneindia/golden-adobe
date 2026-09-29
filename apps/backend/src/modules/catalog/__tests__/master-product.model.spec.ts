import { TestingModule, Test } from '@nestjs/testing';
import { SequelizeModule } from '@nestjs/sequelize';

import { CATALOG_TEST_MODELS } from './test-db';
import { Category } from '../models/category.model';
import { MasterProduct, MasterProductStatus } from '../models/master-product.model';
import { Brand } from '../models/brand.model';

// Regression test for a real bug found and fixed this session: the
// productCode column has a DB-side sequence default
// (master_product_code_seq), but the Sequelize model originally declared
// allowNull: false with no defaultValue — Sequelize's own not-null
// validation rejected a create() that omitted productCode BEFORE the
// query was ever sent, so the DB default was never reached. Fixed by
// giving the model a `literal(...)` defaultValue that mirrors the
// migration's DEFAULT expression exactly. This test exists so that fix
// can never silently regress.
describe('MasterProduct model (integration)', () => {
  let moduleRef: TestingModule;
  const suffix = `t${Date.now()}`;
  let categoryId: string;

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
      name: `MP Model Test Cat ${suffix}`,
      slug: `mp-model-test-cat-${suffix}`,
      level: 1,
      path: `mp-model-test-cat-${suffix}`,
      isLeaf: true,
    } as never);
    categoryId = category.id;
  });

  afterAll(async () => {
    await Category.destroy({ where: { id: categoryId } });
    await moduleRef.close();
  });

  it('auto-generates productCode via the DB sequence when omitted from create()', async () => {
    const product = await MasterProduct.create({
      categoryId,
      name: `MP Autocode Test ${suffix}`,
      slug: `mp-autocode-test-${suffix}`,
      isGeneric: true,
      status: MasterProductStatus.LIVE,
      // productCode deliberately NOT supplied — this is exactly what
      // failed before the fix.
    } as never);

    expect(product.productCode).toMatch(/^GA-\d{7}$/);

    await product.destroy();
  });

  it('two products created without an explicit productCode get DIFFERENT codes', async () => {
    const productA = await MasterProduct.create({
      categoryId,
      name: `MP Autocode A ${suffix}`,
      slug: `mp-autocode-a-${suffix}`,
      isGeneric: true,
      status: MasterProductStatus.LIVE,
    } as never);
    const productB = await MasterProduct.create({
      categoryId,
      name: `MP Autocode B ${suffix}`,
      slug: `mp-autocode-b-${suffix}`,
      isGeneric: true,
      status: MasterProductStatus.LIVE,
    } as never);

    expect(productA.productCode).not.toBe(productB.productCode);

    await productA.destroy();
    await productB.destroy();
  });

  it('rejects a duplicate (brand, mfr_part_number) pair — decision 0012 primary dedup', async () => {
    const brand = await Brand.create({
      name: `MP Dedup Brand ${suffix}`,
      slug: `mp-dedup-brand-${suffix}`,
      manufacturerName: 'Test',
      manufacturerAddress: 'Test',
      consumerCareEmail: 'care@test.com',
      consumerCarePhone: '+911234567890',
    } as never);

    const first = await MasterProduct.create({
      categoryId,
      brandId: brand.id,
      name: `MP Dedup First ${suffix}`,
      slug: `mp-dedup-first-${suffix}`,
      mfrPartNumber: `DEDUP-MPN-${suffix}`,
      status: MasterProductStatus.LIVE,
    } as never);

    await expect(
      MasterProduct.create({
        categoryId,
        brandId: brand.id,
        name: `MP Dedup Second ${suffix}`,
        slug: `mp-dedup-second-${suffix}`,
        mfrPartNumber: `DEDUP-MPN-${suffix}`,
        status: MasterProductStatus.LIVE,
      } as never),
    ).rejects.toThrow();

    await first.destroy();
    await brand.destroy();
  });

  it('rejects is_generic=true combined with a brand_id set', async () => {
    const brand = await Brand.create({
      name: `MP Generic Brand ${suffix}`,
      slug: `mp-generic-brand-${suffix}`,
      manufacturerName: 'Test',
      manufacturerAddress: 'Test',
      consumerCareEmail: 'care@test.com',
      consumerCarePhone: '+911234567890',
    } as never);

    await expect(
      MasterProduct.create({
        categoryId,
        brandId: brand.id,
        name: `MP Bad Generic ${suffix}`,
        slug: `mp-bad-generic-${suffix}`,
        isGeneric: true,
        status: MasterProductStatus.LIVE,
      } as never),
    ).rejects.toThrow();

    await brand.destroy();
  });
});
