import { randomUUID } from 'crypto';
import { ConfigModule } from '@nestjs/config';
import { SequelizeModule } from '@nestjs/sequelize';
import { Test, TestingModule } from '@nestjs/testing';
import {
  fromSearchDocumentRecord,
  toSearchDocumentRecord,
  type SearchDocument,
} from '@golden-abode/types';

import { CATALOG_TEST_MODELS } from '../../catalog/__tests__/test-db';
import { originalKey } from '../../catalog/media/media-keys';
import { Category } from '../../catalog/models/category.model';
import { City } from '../../catalog/models/city.model';
import { MasterProduct, MasterProductStatus } from '../../catalog/models/master-product.model';
import {
  MasterProductMedia,
  MediaType,
  ProcessingStatus,
} from '../../catalog/models/master-product-media.model';
import { VendorListing } from '../../catalog/models/vendor-listing.model';
import { User } from '../../users/models/user.model';
import { Vendor } from '../../vendors/models/vendor.model';
import { PostgresSearchService } from '../fallback/postgres-search.service';
import { SearchDocumentBuilder } from '../indexing/search-document.builder';
import { toPrimaryImage } from '../primary-image';

jest.setTimeout(60_000);

const BASE = 'https://cdn.test';

describe('toPrimaryImage', () => {
  const key = originalKey(
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'image/jpeg',
  );

  it('derives all three variant URLs from a stored key', () => {
    expect(toPrimaryImage(BASE, { key, url: 'ignored' })).toEqual({
      thumb: `${BASE}/variants/products/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/thumb.webp`,
      medium: `${BASE}/variants/products/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/medium.webp`,
      large: `${BASE}/variants/products/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/large.webp`,
    });
  });

  it('uses the one URL for every size when there is no key (an external image)', () => {
    expect(toPrimaryImage(BASE, { key: null, url: 'https://example.com/a.jpg' })).toEqual({
      thumb: 'https://example.com/a.jpg',
      medium: 'https://example.com/a.jpg',
      large: 'https://example.com/a.jpg',
    });
  });

  it('is null for no image, and for a stored image when no public base is configured', () => {
    expect(toPrimaryImage(BASE, null)).toBeNull();
    expect(toPrimaryImage(BASE, undefined)).toBeNull();
    expect(toPrimaryImage('', { key, url: 'x' })).toBeNull();
  });
});

describe('search document record mapping', () => {
  const doc: SearchDocument = {
    id: 'a__b',
    masterProductId: 'a',
    cityId: 'b',
    name: 'n',
    categoryPath: 'c',
    brand: null,
    attributes: {},
    price: 1,
    cheapestVendorListingId: 'l',
    vendorCount: 1,
    inStock: true,
    primaryImage: { thumb: 't', medium: 'm', large: 'l' },
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  it('round-trips the primary image', () => {
    expect(fromSearchDocumentRecord(toSearchDocumentRecord(doc)).primaryImage).toEqual(
      doc.primaryImage,
    );
  });

  it('reads a document indexed before the field existed as having no image', () => {
    const legacy: Partial<ReturnType<typeof toSearchDocumentRecord>> = toSearchDocumentRecord(doc);
    delete legacy.primary_image;
    expect(fromSearchDocumentRecord(legacy as never).primaryImage).toBeNull();
  });
});

// Both engines against real Postgres. They are meant to answer identically, so
// each case asserts that as well as the expected image.
describe('primary image in search (real Postgres)', () => {
  let moduleRef: TestingModule;
  let builder: SearchDocumentBuilder;
  let fallback: PostgresSearchService;
  const suffix = `p${Date.now()}`;

  let cityId: string;
  let categoryId: string;
  let categoryPath: string;
  let vendorId: string;
  let userId: string;
  const productIds: string[] = [];

  async function liveProductWithListing(): Promise<string> {
    const n = productIds.length;
    const product = await MasterProduct.create({
      categoryId,
      name: `Search Image Product ${suffix}-${n}`,
      slug: `search-image-product-${suffix}-${n}`,
      isGeneric: true,
      status: MasterProductStatus.LIVE,
    } as never);
    productIds.push(product.id);
    await VendorListing.create({
      vendorId,
      masterProductId: product.id,
      price: 100 + n,
      status: 'active',
    } as never);
    return product.id;
  }

  async function addImage(
    productId: string,
    over: Partial<{
      status: ProcessingStatus;
      isPrimary: boolean;
      displayOrder: number;
      type: MediaType;
      external: boolean;
    }> = {},
  ): Promise<string> {
    const mediaId = randomUUID();
    await MasterProductMedia.create({
      id: mediaId,
      masterProductId: productId,
      url: over.external ? 'https://example.com/legacy.jpg' : 'unused',
      type: over.type ?? MediaType.IMAGE,
      isPrimary: over.isPrimary ?? false,
      displayOrder: over.displayOrder ?? 0,
      storageKey: over.external ? null : originalKey(productId, mediaId, 'image/jpeg'),
      processingStatus: over.status ?? ProcessingStatus.READY,
    } as never);
    return mediaId;
  }

  const variantsOf = (productId: string, mediaId: string) => ({
    thumb: `${BASE}/variants/products/${productId}/${mediaId}/thumb.webp`,
    medium: `${BASE}/variants/products/${productId}/${mediaId}/medium.webp`,
    large: `${BASE}/variants/products/${productId}/${mediaId}/large.webp`,
  });

  // What each engine says the product's image is.
  async function imagesFor(productId: string) {
    const built = await builder.build([{ masterProductId: productId, cityId }]);
    expect(built.documents).toHaveLength(1);
    const fromIndex = fromSearchDocumentRecord(built.documents[0]).primaryImage;

    const results = await fallback.search({ cityId, categoryPath });
    const hit = results.find((r) => r.masterProductId === productId);
    expect(hit).toBeDefined();
    return { fromIndex, fromFallback: hit!.primaryImage };
  }

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ storage: { publicBaseUrl: BASE } })],
        }),
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
      providers: [SearchDocumentBuilder, PostgresSearchService],
    }).compile();
    builder = moduleRef.get(SearchDocumentBuilder);
    fallback = moduleRef.get(PostgresSearchService);

    const city = await City.create({
      name: `Search Image City ${suffix}`,
      slug: `search-image-city-${suffix}`,
      state: 'Test State',
      centroidLat: 28.6,
      centroidLng: 77.2,
      isActive: true,
    } as never);
    cityId = city.id;

    const user = await User.create({
      name: `Search Image Vendor ${suffix}`,
      phone: `+91${suffix.slice(-10).padStart(10, '9')}`,
      role: 'VENDOR',
    } as never);
    userId = user.id;
    const vendor = await Vendor.create({
      userId,
      shopName: `Search Image Shop ${suffix}`,
      address: 'Test Address',
      latitude: 28.6,
      longitude: 77.2,
      cityId,
    } as never);
    vendorId = vendor.id;

    categoryPath = `search-image-cat-${suffix}`;
    const category = await Category.create({
      name: `Search Image Cat ${suffix}`,
      slug: categoryPath,
      level: 1,
      path: categoryPath,
      isLeaf: true,
    } as never);
    categoryId = category.id;
  });

  afterAll(async () => {
    await VendorListing.destroy({ where: { masterProductId: productIds } });
    await MasterProduct.sequelize!.query(
      `DELETE FROM search_outbox WHERE entity_id = ANY(CAST(:ids AS uuid[]))`,
      { replacements: { ids: `{${productIds.join(',')}}` } },
    );
    await MasterProduct.destroy({ where: { id: productIds } });
    await Vendor.destroy({ where: { id: vendorId } });
    await User.destroy({ where: { id: userId } });
    await Category.destroy({ where: { id: categoryId } });
    await City.destroy({ where: { id: cityId } });
    await moduleRef.close();
  });

  it('is null in both engines for a product with no images', async () => {
    const productId = await liveProductWithListing();

    expect(await imagesFor(productId)).toEqual({ fromIndex: null, fromFallback: null });
  });

  it('gives both engines the same three variant URLs for a ready image', async () => {
    const productId = await liveProductWithListing();
    const mediaId = await addImage(productId, { isPrimary: true });

    const { fromIndex, fromFallback } = await imagesFor(productId);

    expect(fromIndex).toEqual(variantsOf(productId, mediaId));
    expect(fromFallback).toEqual(fromIndex);
  });

  it('ignores an image that is still processing or has failed', async () => {
    const productId = await liveProductWithListing();
    await addImage(productId, { status: ProcessingStatus.PROCESSING, isPrimary: true });
    await addImage(productId, { status: ProcessingStatus.FAILED, displayOrder: 1 });

    expect(await imagesFor(productId)).toEqual({ fromIndex: null, fromFallback: null });
  });

  it('falls back to a ready image when the primary one is not ready yet', async () => {
    const productId = await liveProductWithListing();
    await addImage(productId, { status: ProcessingStatus.PROCESSING, isPrimary: true });
    const ready = await addImage(productId, { displayOrder: 1 });

    const { fromIndex, fromFallback } = await imagesFor(productId);

    expect(fromIndex).toEqual(variantsOf(productId, ready));
    expect(fromFallback).toEqual(fromIndex);
  });

  it('prefers the primary image over a lower display order', async () => {
    const productId = await liveProductWithListing();
    await addImage(productId, { displayOrder: 0 });
    const primary = await addImage(productId, { isPrimary: true, displayOrder: 5 });

    const { fromIndex, fromFallback } = await imagesFor(productId);

    expect(fromIndex).toEqual(variantsOf(productId, primary));
    expect(fromFallback).toEqual(fromIndex);
  });

  it('takes the lowest display order when no image is marked primary', async () => {
    const productId = await liveProductWithListing();
    await addImage(productId, { displayOrder: 3 });
    const first = await addImage(productId, { displayOrder: 1 });

    expect((await imagesFor(productId)).fromIndex).toEqual(variantsOf(productId, first));
  });

  it('uses the external URL for every size when the image was never uploaded', async () => {
    const productId = await liveProductWithListing();
    await addImage(productId, { external: true, isPrimary: true });
    const url = 'https://example.com/legacy.jpg';

    const { fromIndex, fromFallback } = await imagesFor(productId);

    expect(fromIndex).toEqual({ thumb: url, medium: url, large: url });
    expect(fromFallback).toEqual(fromIndex);
  });

  it('never picks a spec sheet or certificate as the product image', async () => {
    const productId = await liveProductWithListing();
    await addImage(productId, { type: MediaType.SPEC_SHEET_PDF, isPrimary: true });

    expect(await imagesFor(productId)).toEqual({ fromIndex: null, fromFallback: null });
  });
});
