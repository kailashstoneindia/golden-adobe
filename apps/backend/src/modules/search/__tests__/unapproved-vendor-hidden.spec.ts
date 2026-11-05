import { ConfigModule } from '@nestjs/config';
import { SequelizeModule } from '@nestjs/sequelize';
import { Test, TestingModule } from '@nestjs/testing';
import { QueryTypes } from 'sequelize';

import { CATALOG_TEST_MODELS } from '../../catalog/__tests__/test-db';
import { Category } from '../../catalog/models/category.model';
import { City } from '../../catalog/models/city.model';
import {
  MasterProduct,
  MasterProductStatus,
  SaleUnitType,
} from '../../catalog/models/master-product.model';
import { VendorListing, VendorListingStatus } from '../../catalog/models/vendor-listing.model';
import { User } from '../../users/models/user.model';
import { Vendor } from '../../vendors/models/vendor.model';
import { PostgresSearchService } from '../fallback/postgres-search.service';
import { SearchDocumentBuilder } from '../indexing/search-document.builder';

// Decision 0059 G1, option A: listings of a vendor whose account is not
// approved are left out of search; approving the vendor brings them back.
describe('unapproved vendors are hidden from search (integration)', () => {
  let moduleRef: TestingModule;
  let search: PostgresSearchService;
  let builder: SearchDocumentBuilder;
  const tag = `hide${Math.random().toString(36).slice(2, 8)}`;
  let cityId: string;
  let productId: string;
  let userId: string;
  let vendorId: string;
  let categoryId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
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
        SequelizeModule.forFeature([MasterProduct]),
      ],
      providers: [PostgresSearchService, SearchDocumentBuilder],
    }).compile();
    search = moduleRef.get(PostgresSearchService);
    builder = moduleRef.get(SearchDocumentBuilder);

    const city = await City.create({
      name: `City ${tag}`,
      slug: `city-${tag}`,
      state: 'KA',
      centroidLat: 12.97,
      centroidLng: 77.59,
      isActive: true,
    } as never);
    cityId = city.id;
    const category = await Category.create({
      name: `Cat ${tag}`,
      slug: `cat-${tag}`,
      level: 1,
      path: `cat-${tag}`,
      isLeaf: true,
    } as never);
    categoryId = category.id;
    const product = await MasterProduct.create({
      categoryId,
      name: `Granite ${tag}`,
      slug: `granite-${tag}`,
      status: MasterProductStatus.LIVE,
      saleUnitType: SaleUnitType.DISCRETE,
    } as never);
    productId = product.id;
    const user = await User.create({
      name: `Seller ${tag}`,
      phone: `5${Math.floor(Math.random() * 1e9)}`.padEnd(10, '0').slice(0, 10),
      role: 'VENDOR',
      isActive: true,
      isApproved: true,
    } as never);
    userId = user.id;
    const vendor = await Vendor.create({
      userId,
      shopName: `Shop ${tag}`,
      address: '1 Test Street',
      latitude: 12.97,
      longitude: 77.59,
      cityId,
    } as never);
    vendorId = vendor.id;
    await VendorListing.create({
      vendorId,
      masterProductId: productId,
      price: 450,
      status: VendorListingStatus.ACTIVE,
    } as never);
  });

  afterAll(async () => {
    const sequelize = User.sequelize!;
    await sequelize.query('DELETE FROM search_outbox WHERE entity_id = :productId', {
      replacements: { productId },
    });
    await VendorListing.destroy({ where: { vendorId } });
    await Vendor.destroy({ where: { id: vendorId } });
    await User.destroy({ where: { id: userId } });
    await MasterProduct.destroy({ where: { id: productId } });
    await Category.destroy({ where: { id: categoryId } });
    await sequelize.query('DELETE FROM search_outbox WHERE city_id = :cityId', {
      replacements: { cityId },
    });
    await City.destroy({ where: { id: cityId } });
    await moduleRef.close();
  });

  const setApproved = (isApproved: boolean) =>
    User.update({ isApproved }, { where: { id: userId } });
  const found = async () =>
    (await search.search({ cityId, query: `Granite ${tag}` })).some(
      (doc) => doc.masterProductId === productId,
    );

  it('shows an approved vendor’s listing in search, other sellers and the index', async () => {
    await setApproved(true);

    expect(await found()).toBe(true);
    expect((await search.listingsForProduct(productId, cityId)).length).toBe(1);
    const built = await builder.build([{ masterProductId: productId, cityId }]);
    expect(built.documents).toHaveLength(1);
  });

  it('hides it everywhere once the vendor is not approved', async () => {
    await setApproved(false);

    expect(await found()).toBe(false);
    expect(await search.listingsForProduct(productId, cityId)).toEqual([]);
    const built = await builder.build([{ masterProductId: productId, cityId }]);
    expect(built.documents).toHaveLength(0);
    expect(built.deleteIds).toHaveLength(1);
  });

  it('brings it back when the vendor is approved again', async () => {
    await setApproved(false);
    await setApproved(true);

    expect(await found()).toBe(true);
  });

  it('queues the vendor’s products for re-indexing when approval changes', async () => {
    await setApproved(true);
    const before = await outboxRows();
    await setApproved(false);

    const after = await outboxRows();
    expect(after).toBeGreaterThan(before);
  });

  it('does not queue anything when an unrelated user field changes', async () => {
    const before = await outboxRows();
    await User.update({ name: `Seller ${tag} renamed` }, { where: { id: userId } });

    expect(await outboxRows()).toBe(before);
  });

  it('queues the product for the vendor’s own city', async () => {
    await setApproved(true);
    await setApproved(false);

    const [row] = await User.sequelize!.query<{ city_id: string | null }>(
      `SELECT city_id FROM search_outbox
        WHERE entity_type = 'master_product' AND entity_id = :productId
          AND reason = 'vendor approval changed'
        ORDER BY id DESC LIMIT 1`,
      { replacements: { productId }, type: QueryTypes.SELECT },
    );
    expect(row.city_id).toBe(cityId);
  });

  it('queues nothing when approval is set to the value it already has', async () => {
    await setApproved(true);
    const before = await outboxRows();
    await setApproved(true);

    expect(await outboxRows()).toBe(before);
  });

  async function outboxRows(): Promise<number> {
    const [row] = await User.sequelize!.query<{ n: string }>(
      `SELECT count(*) AS n FROM search_outbox
        WHERE entity_type = 'master_product' AND entity_id = :productId
          AND reason = 'vendor approval changed'`,
      { replacements: { productId }, type: QueryTypes.SELECT },
    );
    return Number(row.n);
  }
});
