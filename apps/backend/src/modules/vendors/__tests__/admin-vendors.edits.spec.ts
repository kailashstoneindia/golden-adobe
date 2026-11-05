import { Logger } from '@nestjs/common';
import request from 'supertest';
import { QueryTypes } from 'sequelize';

import { createVendorsTestApp, VendorsTestApp } from './vendors-test-app';
import { User } from '../../users/models/user.model';
import { Vendor } from '../models/vendor.model';

jest.setTimeout(60_000);

const sql = <T extends object>(query: string, replacements: Record<string, unknown> = {}) =>
  User.sequelize!.query<T>(query, { replacements, type: QueryTypes.SELECT });

const BANK = {
  accountHolderName: 'Vikram Stones',
  bankName: 'HDFC Bank',
  ifscCode: 'hdfc0000123',
  branchName: 'Vaishali Nagar',
  accountNumber: '123456789012',
};

// Decision 0058 Task 10: the admin fixes a vendor's profile and bank details
// and pauses or reactivates a single listing.
describe('Admin vendor edits (real HTTP, Postgres)', () => {
  let t: VendorsTestApp;
  let vendorId: string;
  const tag = `ave${Math.random().toString(36).slice(2, 8)}`;
  const created: { category?: string; products: string[]; listings: string[] } = {
    products: [],
    listings: [],
  };
  const asAdmin = (req: request.Test) => req.set('Authorization', `Bearer ${t.adminToken}`);
  const asVendor = (req: request.Test) => req.set('Authorization', `Bearer ${t.vendorToken}`);
  const server = () => t.app.getHttpServer();
  const logLines = (spy: jest.SpyInstance) => spy.mock.calls.map((call) => String(call[0]));

  async function listing(opts: { status?: string; candidates?: string; stock?: number } = {}) {
    const n = created.products.length;
    const [{ id: productId }] = await sql<{ id: string }>(
      `INSERT INTO master_product (id, category_id, name, slug, product_code, status, created_at, updated_at)
       VALUES (gen_random_uuid(), :c, :name, :slug, :code, 'live', now(), now()) RETURNING id`,
      {
        c: created.category,
        name: `Slab ${tag} ${n}`,
        slug: `slab-${tag}-${n}`,
        code: `${tag.toUpperCase()}-${n}`,
      },
    );
    created.products.push(productId);
    const [{ id }] = await sql<{ id: string }>(
      `INSERT INTO vendor_listing (id, vendor_id, master_product_id, price, status, match_candidates, created_at, updated_at)
       VALUES (gen_random_uuid(), :vendorId, :p, 100, :status, CAST(:candidates AS jsonb), now(), now()) RETURNING id`,
      {
        vendorId,
        p: productId,
        status: opts.status ?? 'active',
        candidates: opts.candidates ?? '[]',
      },
    );
    created.listings.push(id);
    if (opts.stock !== undefined) {
      await sql(
        `INSERT INTO inventory (id, vendor_listing_id, quantity_available, quantity_reserved, created_at, updated_at)
         VALUES (gen_random_uuid(), :id, :stock, 0, now(), now())`,
        { id, stock: opts.stock },
      );
    }
    return id;
  }

  const statusOf = async (id: string) =>
    (
      await sql<{ status: string }>(
        `SELECT status::text AS status FROM vendor_listing WHERE id = :id`,
        { id },
      )
    )[0].status;

  beforeAll(async () => {
    t = await createVendorsTestApp();
    ({ vendorId } = await t.newVendor());
    const [{ id }] = await sql<{ id: string }>(
      `INSERT INTO category (id, name, slug, level, path, is_leaf, created_at, updated_at)
       VALUES (gen_random_uuid(), :name, :slug, 1, :slug, true, now(), now()) RETURNING id`,
      { name: `Cat ${tag}`, slug: `cat-${tag}` },
    );
    created.category = id;
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    await sql(`DELETE FROM inventory WHERE vendor_listing_id IN (:ids)`, {
      ids: created.listings.length ? created.listings : [null],
    });
    await sql(`DELETE FROM vendor_listing WHERE vendor_id = :vendorId`, { vendorId });
    if (created.products.length) {
      await sql(`DELETE FROM master_product WHERE id IN (:ids)`, { ids: created.products });
    }
    await sql(`DELETE FROM category WHERE id = :id`, { id: created.category });
    await sql(`DELETE FROM vendor_account_details WHERE vendor_id = :vendorId`, { vendorId });
    await t.close();
  });

  describe('PATCH /admin/vendors/:id', () => {
    it('changes only the fields sent and answers with the admin view', async () => {
      const before = (await Vendor.findByPk(vendorId))!;

      const res = await asAdmin(request(server()).patch(`/api/admin/vendors/${vendorId}`)).send({
        shopName: '  Vikram Stone Mart ',
        gstin: '22aaaaa0000a1z5',
        minOrderValue: 2500,
        hasLoadingUnloadingTeam: true,
      });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        id: vendorId,
        shopName: 'Vikram Stone Mart',
        gstin: '22AAAAA0000A1Z5',
        minOrderValue: 2500,
        hasLoadingUnloadingTeam: true,
        address: before.address,
        owner: { userId: before.userId },
      });
    });

    it('moves the pin when latitude and longitude come together', async () => {
      const res = await asAdmin(request(server()).patch(`/api/admin/vendors/${vendorId}`)).send({
        latitude: 26.9124,
        longitude: 75.7873,
      });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ latitude: 26.9124, longitude: 75.7873 });
    });

    it.each([
      ['a lone latitude', { latitude: 12.5 }],
      ['a GSTIN of the wrong length', { gstin: '123' }],
      ['a negative minimum order', { minOrderValue: -1 }],
      ['a blank shop name', { shopName: '   ' }],
      ['an unknown field (status)', { status: 'APPROVED' }],
      ['an unknown field (userId)', { userId: '11111111-1111-4111-8111-111111111111' }],
      ['a null shop name', { shopName: null }],
      ['a null GSTIN', { gstin: null }],
    ])('refuses %s with 400 and changes nothing', async (_name, body) => {
      const before = (await Vendor.findByPk(vendorId))!.get({ plain: true });

      const res = await asAdmin(request(server()).patch(`/api/admin/vendors/${vendorId}`)).send(
        body,
      );

      expect(res.status).toBe(400);
      const after = (await Vendor.findByPk(vendorId))!.get({ plain: true });
      expect(after).toEqual(before);
    });

    it('404s for an unknown vendor and 400s for a malformed id', async () => {
      const missing = '11111111-1111-4111-8111-111111111111';
      expect(
        (
          await asAdmin(request(server()).patch(`/api/admin/vendors/${missing}`)).send({
            shopName: 'X',
          })
        ).status,
      ).toBe(404);
      expect(
        (await asAdmin(request(server()).patch('/api/admin/vendors/nope')).send({ shopName: 'X' }))
          .status,
      ).toBe(400);
    });

    it('is closed to a vendor', async () => {
      const res = await asVendor(request(server()).patch(`/api/admin/vendors/${vendorId}`)).send({
        shopName: 'Mine',
      });

      expect(res.status).toBe(403);
    });

    it('logs which admin changed which fields, only those that changed', async () => {
      await Vendor.update({ shopName: 'Same Name' }, { where: { id: vendorId } });
      const log = jest.spyOn(Logger.prototype, 'log');

      await asAdmin(request(server()).patch(`/api/admin/vendors/${vendorId}`)).send({
        shopName: 'Same Name',
        address: '9 New Street',
      });

      expect(logLines(log)).toContain(`admin ${t.adminUserId} update vendor ${vendorId} address`);
    });

    it('logs nothing when nothing changed', async () => {
      const current = (await Vendor.findByPk(vendorId))!;
      const log = jest.spyOn(Logger.prototype, 'log');

      const res = await asAdmin(request(server()).patch(`/api/admin/vendors/${vendorId}`)).send({
        shopName: current.shopName,
      });

      expect(res.status).toBe(200);
      expect(logLines(log).filter((line) => line.startsWith('admin '))).toEqual([]);
    });
  });

  describe('PUT /admin/vendors/:id/account-details', () => {
    it('creates the bank record, upper-casing the IFSC, then updates the same row', async () => {
      const first = await asAdmin(
        request(server()).put(`/api/admin/vendors/${vendorId}/account-details`),
      ).send(BANK);

      expect(first.status).toBe(200);
      expect(first.body.data.accountDetails).toMatchObject({ ...BANK, ifscCode: 'HDFC0000123' });

      const second = await asAdmin(
        request(server()).put(`/api/admin/vendors/${vendorId}/account-details`),
      ).send({
        ...BANK,
        bankName: 'ICICI Bank',
        ifscCode: 'ICIC0000456',
      });

      expect(second.body.data.accountDetails).toMatchObject({
        bankName: 'ICICI Bank',
        ifscCode: 'ICIC0000456',
      });
      const [{ n }] = await sql<{ n: string }>(
        `SELECT count(*) AS n FROM vendor_account_details WHERE vendor_id = :vendorId`,
        { vendorId },
      );
      expect(Number(n)).toBe(1);
    });

    it.each(['accountHolderName', 'bankName', 'ifscCode', 'branchName', 'accountNumber'])(
      'needs the complete set: refuses a missing %s',
      async (field) => {
        const rest: Partial<typeof BANK> = { ...BANK };
        delete rest[field as keyof typeof BANK];

        const res = await asAdmin(
          request(server()).put(`/api/admin/vendors/${vendorId}/account-details`),
        ).send(rest);

        expect(res.status).toBe(400);
      },
    );

    it('refuses an unknown field', async () => {
      const res = await asAdmin(
        request(server()).put(`/api/admin/vendors/${vendorId}/account-details`),
      ).send({
        ...BANK,
        vendorId: '11111111-1111-4111-8111-111111111111',
      });

      expect(res.status).toBe(400);
    });

    it('404s for an unknown vendor, and is closed to a vendor', async () => {
      const missing = '11111111-1111-4111-8111-111111111111';
      expect(
        (
          await asAdmin(
            request(server()).put(`/api/admin/vendors/${missing}/account-details`),
          ).send(BANK)
        ).status,
      ).toBe(404);
      expect(
        (
          await asVendor(
            request(server()).put(`/api/admin/vendors/${vendorId}/account-details`),
          ).send(BANK)
        ).status,
      ).toBe(403);
    });

    it('logs the field names that changed and never the account number', async () => {
      await asAdmin(request(server()).put(`/api/admin/vendors/${vendorId}/account-details`)).send({
        ...BANK,
        ifscCode: 'HDFC0000123',
        accountNumber: '111122223333',
      });
      const log = jest.spyOn(Logger.prototype, 'log');

      await asAdmin(request(server()).put(`/api/admin/vendors/${vendorId}/account-details`)).send({
        ...BANK,
        ifscCode: 'HDFC0000123',
        accountNumber: '999988887777',
      });

      const lines = logLines(log);
      expect(lines).toContain(
        `admin ${t.adminUserId} update vendor-bank ${vendorId} accountNumber`,
      );
      expect(lines.join('\n')).not.toContain('999988887777');
    });
  });

  describe('PATCH /admin/vendor-listings/:id/status', () => {
    const patchStatus = (id: string, body: object) =>
      asAdmin(request(server()).patch(`/api/admin/vendor-listings/${id}/status`)).send(body);

    it('pauses a listing and reactivates it, leaving the stock alone', async () => {
      const id = await listing({ stock: 7 });

      const paused = await patchStatus(id, { status: 'paused' });
      expect(paused.status).toBe(200);
      expect(paused.body.data).toMatchObject({ id, status: 'paused', quantityAvailable: 7 });
      expect(await statusOf(id)).toBe('paused');

      const active = await patchStatus(id, { status: 'active' });
      expect(active.body.data).toMatchObject({ id, status: 'active', quantityAvailable: 7 });
    });

    it('can bring an out-of-stock listing back to active', async () => {
      const id = await listing({ status: 'out_of_stock' });

      expect((await patchStatus(id, { status: 'active' })).status).toBe(200);
      expect(await statusOf(id)).toBe('active');
    });

    it.each([
      ['out_of_stock (the vendor’s own call)', { status: 'out_of_stock' }],
      ['an unknown status', { status: 'deleted' }],
      ['no status', {}],
      ['an unknown field', { status: 'paused', price: 1 }],
    ])('refuses %s with 400', async (_name, body) => {
      const id = await listing();

      expect((await patchStatus(id, body)).status).toBe(400);
      expect(await statusOf(id)).toBe('active');
    });

    it('will not publish a listing still waiting for the vendor to confirm a product match', async () => {
      const id = await listing({
        status: 'paused',
        candidates: JSON.stringify([{ masterProductId: 'x', score: 0.5 }]),
      });

      const res = await patchStatus(id, { status: 'active' });

      expect(res.status).toBe(409);
      expect(await statusOf(id)).toBe('paused');
    });

    it('404s for an unknown listing, 400s for a malformed id, and is closed to a vendor', async () => {
      const id = await listing();
      expect(
        (await patchStatus('11111111-1111-4111-8111-111111111111', { status: 'paused' })).status,
      ).toBe(404);
      expect((await patchStatus('nope', { status: 'paused' })).status).toBe(400);
      const res = await asVendor(
        request(server()).patch(`/api/admin/vendor-listings/${id}/status`),
      ).send({ status: 'paused' });
      expect(res.status).toBe(403);
    });

    it('logs the action, and nothing when the listing is already in that state', async () => {
      const id = await listing();
      const log = jest.spyOn(Logger.prototype, 'log');

      await patchStatus(id, { status: 'paused' });
      await patchStatus(id, { status: 'paused' });
      await patchStatus(id, { status: 'active' });

      const lines = logLines(log).filter((line) => line.includes(id));
      expect(lines).toEqual([
        `admin ${t.adminUserId} pause vendor-listing ${id} status`,
        `admin ${t.adminUserId} reactivate vendor-listing ${id} status`,
      ]);
    });
  });
});
