import request from 'supertest';
import { QueryTypes } from 'sequelize';

import { createVendorsTestApp, VendorsTestApp } from './vendors-test-app';
import { User } from '../../users/models/user.model';

jest.setTimeout(60_000);

// Decision 0058 Task 5: the admin sees everything about a vendor: owner,
// payout, warehouses, and listings with stock.
describe('Admin vendor detail (real HTTP, Postgres)', () => {
  let t: VendorsTestApp;
  let vendorId: string;
  let userId: string;
  const tag = `avd${Math.random().toString(36).slice(2, 8)}`;
  const ids: { category?: string; products: string[]; listings: string[] } = {
    products: [],
    listings: [],
  };

  const asAdmin = (req: request.Test) => req.set('Authorization', `Bearer ${t.adminToken}`);
  const sql = <T extends object>(query: string, replacements: Record<string, unknown> = {}) =>
    User.sequelize!.query<T>(query, { replacements, type: QueryTypes.SELECT });
  // First row of an INSERT … RETURNING id.
  const insertId = async (query: string, replacements: Record<string, unknown>) =>
    (await sql<{ id: string }>(query, replacements))[0]!.id;

  beforeAll(async () => {
    t = await createVendorsTestApp();
    ({ vendorId, userId } = await t.newVendor());
    await User.update({ email: `${tag}@test.local` }, { where: { id: userId } });

    const categoryId = await insertId(
      `INSERT INTO category (id, name, slug, level, path, is_leaf, created_at, updated_at)
       VALUES (gen_random_uuid(), :name, :slug, 1, :slug, true, now(), now()) RETURNING id`,
      { name: `Cat ${tag}`, slug: `cat-${tag}` },
    );
    ids.category = categoryId;
    await sql<object>(
      `INSERT INTO vendor_category (vendor_id, category_id, created_at) VALUES (:vendorId, :c, now())`,
      {
        vendorId,
        c: categoryId,
      },
    );

    for (const [index, status] of (['active', 'paused', 'out_of_stock'] as const).entries()) {
      const productId = await insertId(
        `INSERT INTO master_product (id, category_id, name, slug, product_code, status, created_at, updated_at)
         VALUES (gen_random_uuid(), :c, :name, :slug, :code, 'live', now(), now()) RETURNING id`,
        {
          c: categoryId,
          name: `Tile ${tag} ${index}`,
          slug: `tile-${tag}-${index}`,
          code: `${tag.toUpperCase()}-${index}`,
        },
      );
      ids.products.push(productId);
      const listingId = await insertId(
        `INSERT INTO vendor_listing (id, vendor_id, master_product_id, price, status, vendor_sku, created_at, updated_at)
         VALUES (gen_random_uuid(), :vendorId, :p, :price, :status, :sku, now() - (:index || ' minutes')::interval, now()) RETURNING id`,
        { vendorId, p: productId, price: 100 + index, status, sku: `SKU-${index}`, index },
      );
      ids.listings.push(listingId);
    }
    await sql<object>(
      `INSERT INTO inventory (id, vendor_listing_id, quantity_available, quantity_reserved, created_at, updated_at)
       VALUES (gen_random_uuid(), :l, 40, 3, now(), now())`,
      { l: ids.listings[0] },
    );
    await sql<object>(
      `INSERT INTO vendor_listing_flag (vendor_listing_id, reason) VALUES (:l, 'price looks wrong')`,
      {
        l: ids.listings[0],
      },
    );
    await sql<object>(
      `INSERT INTO vendor_listing_flag (vendor_listing_id, reason, resolved_at) VALUES (:l, 'old issue', now())`,
      { l: ids.listings[1] },
    );
    await sql<object>(
      `INSERT INTO warehouse (id, vendor_id, name, address, is_active, created_at, updated_at)
       VALUES (gen_random_uuid(), :vendorId, 'Main yard', 'Plot 9, Ring Road', true, now(), now())`,
      { vendorId },
    );
  });

  afterAll(async () => {
    await sql<object>(`DELETE FROM vendor_listing_flag WHERE vendor_listing_id IN (:ls)`, {
      ls: ids.listings,
    });
    await sql<object>(`DELETE FROM inventory WHERE vendor_listing_id IN (:ls)`, {
      ls: ids.listings,
    });
    await sql<object>(`DELETE FROM vendor_listing WHERE id IN (:ls)`, { ls: ids.listings });
    await sql<object>(`DELETE FROM warehouse WHERE vendor_id = :vendorId`, { vendorId });
    await sql<object>(`DELETE FROM vendor_category WHERE vendor_id = :vendorId`, { vendorId });
    await sql<object>(`DELETE FROM search_outbox WHERE entity_id IN (:ps)`, { ps: ids.products });
    await sql<object>(`DELETE FROM master_product WHERE id IN (:ps)`, { ps: ids.products });
    await sql<object>(`DELETE FROM category WHERE id = :c`, { c: ids.category });
    await t.close();
  });

  it('lists vendors with owner contact, counts and warehouses', async () => {
    const res = await asAdmin(request(t.app.getHttpServer()).get('/api/admin/vendors'));
    expect(res.status).toBe(200);
    const row = res.body.data.find((v: { id: string }) => v.id === vendorId);

    expect(row.owner).toMatchObject({ userId, email: `${tag}@test.local`, role: 'VENDOR' });
    expect(row.owner).not.toHaveProperty('deviceToken');
    expect(row.listingCounts).toEqual({ active: 1, paused: 1, outOfStock: 1 });
    expect(row.openFlagCount).toBe(1);
    expect(row.categoryCount).toBe(1);
    expect(row.orderGroupCount).toBe(0);
    expect(row.warehouses).toEqual([
      expect.objectContaining({ name: 'Main yard', address: 'Plot 9, Ring Road', isActive: true }),
    ]);
  });

  it('returns the same detail for one vendor', async () => {
    const res = await asAdmin(request(t.app.getHttpServer()).get(`/api/admin/vendors/${vendorId}`));
    expect(res.status).toBe(200);
    expect(res.body.data.listingCounts).toEqual({ active: 1, paused: 1, outOfStock: 1 });
    expect(res.body.data.owner.userId).toBe(userId);
  });

  it('pages a vendor’s listings with product, stock and open flags', async () => {
    const res = await asAdmin(
      request(t.app.getHttpServer()).get(`/api/admin/vendors/${vendorId}/listings?page=1&limit=2`),
    );
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ page: 1, limit: 2, total: 3, totalPages: 2 });
    const active = res.body.data.items.find((l: { id: string }) => l.id === ids.listings[0]);
    expect(active).toMatchObject({
      productName: `Tile ${tag} 0`,
      productCode: `${tag.toUpperCase()}-0`,
      vendorSku: 'SKU-0',
      price: 100,
      status: 'active',
      quantityAvailable: 40,
      quantityReserved: 3,
      openFlags: ['price looks wrong'],
    });
  });

  it('filters listings by status', async () => {
    const res = await asAdmin(
      request(t.app.getHttpServer()).get(`/api/admin/vendors/${vendorId}/listings?status=paused`),
    );
    expect(res.body.data.items.map((l: { id: string }) => l.id)).toEqual([ids.listings[1]]);
    // A resolved flag is history, not an open problem.
    expect(res.body.data.items[0].openFlags).toEqual([]);
  });

  it('answers 404 for listings of an unknown vendor', async () => {
    const res = await asAdmin(
      request(t.app.getHttpServer()).get(
        '/api/admin/vendors/00000000-0000-4000-8000-000000000000/listings',
      ),
    );
    expect(res.status).toBe(404);
  });

  it('answers 403 for a vendor calling the admin listings route', async () => {
    const res = await request(t.app.getHttpServer())
      .get(`/api/admin/vendors/${vendorId}/listings`)
      .set('Authorization', `Bearer ${t.vendorToken}`);
    expect(res.status).toBe(403);
  });
});
