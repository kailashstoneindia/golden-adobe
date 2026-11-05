import request from 'supertest';

import { ArtisansTestApp, createArtisansTestApp } from './artisans-test-app';
import { Artisan } from '../models/artisan.model';
import { ArtisanHireRequest } from '../models/artisan-hire-request.model';
import { User } from '../../users/models/user.model';
import { findOnAnyPage } from './find-on-any-page';

jest.setTimeout(60_000);

describe('AdminArtisansController (real HTTP, Postgres)', () => {
  let t: ArtisansTestApp;

  const asAdmin = (req: request.Test) => req.set('Authorization', `Bearer ${t.adminToken}`);
  const asArtisan = (req: request.Test) => req.set('Authorization', `Bearer ${t.artisanToken}`);

  // One page of an admin list; any non-200 fails right here, with its status.
  async function adminPage(url: string) {
    const res = await asAdmin(request(t.app.getHttpServer()).get(url));
    expect(res.status).toBe(200);
    return res.body.data;
  }

  beforeAll(async () => {
    t = await createArtisansTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  afterEach(async () => {
    const artisan = await Artisan.findOne({ where: { userId: t.artisanUserId } });
    if (artisan) {
      await ArtisanHireRequest.destroy({ where: { artisanId: artisan.id } });
      await artisan.destroy();
    }
  });

  it('answers 400 when verifying an artisan with no uploaded document', async () => {
    await asArtisan(
      request(t.app.getHttpServer())
        .post('/api/artisans/me/profile')
        .send({ tradeType: 'PLUMBER', servicePincode: '560001' }),
    );
    const artisan = await Artisan.findOne({ where: { userId: t.artisanUserId } });

    const res = await asAdmin(
      request(t.app.getHttpServer()).patch(`/api/admin/artisans/${artisan!.id}/verify`),
    );
    expect(res.status).toBe(400);
  });

  it('verifies an artisan who has an uploaded document', async () => {
    await asArtisan(
      request(t.app.getHttpServer())
        .post('/api/artisans/me/profile')
        .send({ tradeType: 'PLUMBER', servicePincode: '560001' }),
    );
    const artisan = await Artisan.findOne({ where: { userId: t.artisanUserId } });
    await Artisan.update({ documentUrl: 'artisans/x/doc.pdf' }, { where: { id: artisan!.id } });

    const res = await asAdmin(
      request(t.app.getHttpServer()).patch(`/api/admin/artisans/${artisan!.id}/verify`),
    );
    expect(res.status).toBe(200);
    expect(res.body.data.isVerified).toBe(true);
  });

  it('answers 403 for an artisan calling the review route', async () => {
    await asArtisan(
      request(t.app.getHttpServer())
        .post('/api/artisans/me/profile')
        .send({ tradeType: 'PLUMBER', servicePincode: '560001' }),
    );
    const artisan = await Artisan.findOne({ where: { userId: t.artisanUserId } });
    const hireRequest = await ArtisanHireRequest.create({
      customerId: t.customerUserId,
      artisanId: artisan!.id,
      addressText: '1 Park Lane',
      status: 'PENDING_ADMIN_REVIEW',
    } as never);

    const res = await asArtisan(
      request(t.app.getHttpServer())
        .patch(`/api/admin/artisans/hire-requests/${hireRequest.id}/review`)
        .send({ approve: true }),
    );
    expect(res.status).toBe(403);
  });

  it('admin approving a pending hire request sends it to the artisan (PENDING_ARTISAN_RESPONSE, 0055)', async () => {
    await asArtisan(
      request(t.app.getHttpServer())
        .post('/api/artisans/me/profile')
        .send({ tradeType: 'PLUMBER', servicePincode: '560001' }),
    );
    const artisan = await Artisan.findOne({ where: { userId: t.artisanUserId } });
    const hireRequest = await ArtisanHireRequest.create({
      customerId: t.customerUserId,
      artisanId: artisan!.id,
      addressText: '1 Park Lane',
      status: 'PENDING_ADMIN_REVIEW',
    } as never);

    const res = await asAdmin(
      request(t.app.getHttpServer())
        .patch(`/api/admin/artisans/hire-requests/${hireRequest.id}/review`)
        .send({ approve: true }),
    );
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('PENDING_ARTISAN_RESPONSE');
  });

  it('awaiting-document lists an ustaad with a profile but no document (decision 0058)', async () => {
    await asArtisan(
      request(t.app.getHttpServer())
        .post('/api/artisans/me/profile')
        .send({ tradeType: 'PLUMBER', servicePincode: '560001' }),
    );

    const res = await asAdmin(
      request(t.app.getHttpServer()).get('/api/admin/artisans/awaiting-document?page=1&limit=100'),
    );

    expect(res.status).toBe(200);
    const row = res.body.data.items.find(
      (item: { userId: string }) => item.userId === t.artisanUserId,
    );
    expect(row).toMatchObject({ hasProfile: true, tradeType: 'PLUMBER' });
  });

  it('answers 403 for an artisan calling awaiting-document', async () => {
    const res = await asArtisan(
      request(t.app.getHttpServer()).get('/api/admin/artisans/awaiting-document'),
    );
    expect(res.status).toBe(403);
  });

  describe('verification queue rule on the live endpoint (decision 0058 Task 6 review)', () => {
    const created: string[] = [];
    // Every queue id across all pages, in order.
    async function queueIds(): Promise<string[]> {
      const ids: string[] = [];
      for (let page = 1; ; page += 1) {
        const data = await adminPage(
          `/api/admin/artisans/pending-verification?page=${page}&limit=100`,
        );
        ids.push(...data.items.map((item: { id: string }) => item.id));
        if (page >= data.totalPages) return ids;
      }
    }
    async function ustaad(opts: { document: boolean; verified: boolean; createdAt: string }) {
      const user = await t.newArtisanUser();
      const artisan = await Artisan.create({
        userId: user.id,
        tradeType: 'PLUMBER',
        documentUrl: opts.document ? `artisans/x/${user.id}.pdf` : null,
        isVerified: opts.verified,
      } as never);
      await Artisan.sequelize!.query('UPDATE artisans SET created_at = :at WHERE id = :id', {
        replacements: { at: opts.createdAt, id: artisan.id },
      });
      created.push(artisan.id);
      return artisan.id;
    }

    afterAll(async () => {
      await Artisan.destroy({ where: { id: created } });
    });

    it('leaves out ustaads with no document and ustaads already verified', async () => {
      const noDocument = await ustaad({
        document: false,
        verified: false,
        createdAt: '2026-01-01',
      });
      const verified = await ustaad({ document: true, verified: true, createdAt: '2026-01-01' });
      const waiting = await ustaad({ document: true, verified: false, createdAt: '2026-01-01' });

      const ids = await queueIds();

      expect(ids).toContain(waiting);
      expect(ids).not.toContain(noDocument);
      expect(ids).not.toContain(verified);
    });

    it('is oldest first', async () => {
      const newer = await ustaad({ document: true, verified: false, createdAt: '2026-03-02' });
      const older = await ustaad({ document: true, verified: false, createdAt: '2026-03-01' });

      const ids = await queueIds();

      expect(ids.indexOf(older)).toBeLessThan(ids.indexOf(newer));
    });
  });

  it('pending-verification is a paginated page, not a bare array', async () => {
    await asArtisan(
      request(t.app.getHttpServer())
        .post('/api/artisans/me/profile')
        .send({ tradeType: 'PLUMBER', servicePincode: '560001' }),
    );
    const artisan = await Artisan.findOne({ where: { userId: t.artisanUserId } });
    await Artisan.update({ documentUrl: 'artisans/x/doc.pdf' }, { where: { id: artisan!.id } });

    const res = await asAdmin(
      request(t.app.getHttpServer()).get(
        '/api/admin/artisans/pending-verification?page=1&limit=10',
      ),
    );
    expect(res.status).toBe(200);
    expect(res.body.data.page).toBe(1);
    expect(res.body.data.limit).toBe(10);
    const found = await findOnAnyPage(
      (p) => adminPage(`/api/admin/artisans/pending-verification?page=${p}&limit=100`),
      (a: { id: string }) => a.id === artisan!.id,
    );
    expect(found).toBeDefined();
  });

  it('hire-requests/pending is a paginated page, not a bare array', async () => {
    await asArtisan(
      request(t.app.getHttpServer())
        .post('/api/artisans/me/profile')
        .send({ tradeType: 'PLUMBER', servicePincode: '560001' }),
    );
    const artisan = await Artisan.findOne({ where: { userId: t.artisanUserId } });
    await ArtisanHireRequest.create({
      customerId: t.customerUserId,
      artisanId: artisan!.id,
      addressText: '1 Park Lane',
      status: 'PENDING_ADMIN_REVIEW',
    } as never);

    const res = await asAdmin(
      request(t.app.getHttpServer()).get('/api/admin/artisans/hire-requests/pending'),
    );
    expect(res.status).toBe(200);
    expect(res.body.data.page).toBe(1);
    expect(Array.isArray(res.body.data.items)).toBe(true);
  });

  it('hire-requests JSON carries the customer and the ustaad without email (0058)', async () => {
    await asArtisan(
      request(t.app.getHttpServer())
        .post('/api/artisans/me/profile')
        .send({ tradeType: 'PLUMBER', servicePincode: '560001' }),
    );
    await User.update(
      { email: `hr-json-${Date.now()}@test.local` },
      { where: { id: t.artisanUserId } },
    );
    const artisan = await Artisan.findOne({ where: { userId: t.artisanUserId } });
    const hire = await ArtisanHireRequest.create({
      customerId: t.customerUserId,
      artisanId: artisan!.id,
      addressText: '2 Park Lane',
      status: 'COMPLETED',
    } as never);

    const res = await asAdmin(
      request(t.app.getHttpServer()).get('/api/admin/artisans/hire-requests?limit=100'),
    );
    await User.update({ email: null }, { where: { id: t.artisanUserId } });

    const row = res.body.data.items.find((r: { id: string }) => r.id === hire.id);
    expect(row.customer.userId).toBe(t.customerUserId);
    expect(row.artisan.userId).toBe(t.artisanUserId);
    expect(row.artisan).not.toHaveProperty('email');
    expect(JSON.stringify(res.body)).not.toContain('hr-json-');
  });

  it('hire-requests lists every status, not just pending', async () => {
    await asArtisan(
      request(t.app.getHttpServer())
        .post('/api/artisans/me/profile')
        .send({ tradeType: 'PLUMBER', servicePincode: '560001' }),
    );
    const artisan = await Artisan.findOne({ where: { userId: t.artisanUserId } });
    const completed = await ArtisanHireRequest.create({
      customerId: t.customerUserId,
      artisanId: artisan!.id,
      addressText: '1 Park Lane',
      status: 'COMPLETED',
    } as never);

    const res = await asAdmin(
      request(t.app.getHttpServer()).get('/api/admin/artisans/hire-requests'),
    );
    expect(res.status).toBe(200);
    const found = await findOnAnyPage(
      (p) => adminPage(`/api/admin/artisans/hire-requests?page=${p}&limit=100`),
      (r: { id: string; status: string }) => r.id === completed.id && r.status === 'COMPLETED',
    );
    expect(found).toBeDefined();
  });

  it('hire-requests?status= narrows to that one status', async () => {
    await asArtisan(
      request(t.app.getHttpServer())
        .post('/api/artisans/me/profile')
        .send({ tradeType: 'PLUMBER', servicePincode: '560001' }),
    );
    const artisan = await Artisan.findOne({ where: { userId: t.artisanUserId } });
    await ArtisanHireRequest.create({
      customerId: t.customerUserId,
      artisanId: artisan!.id,
      addressText: '1 Park Lane',
      status: 'IN_PROGRESS',
    } as never);

    const res = await asAdmin(
      request(t.app.getHttpServer()).get('/api/admin/artisans/hire-requests?status=IN_PROGRESS'),
    );
    expect(res.status).toBe(200);
    expect(res.body.data.items.every((r: { status: string }) => r.status === 'IN_PROGRESS')).toBe(
      true,
    );
  });

  it('answers 403 for an artisan calling the admin hire-requests list', async () => {
    const res = await asArtisan(
      request(t.app.getHttpServer()).get('/api/admin/artisans/hire-requests'),
    );
    expect(res.status).toBe(403);
  });

  it('rejecting a verification with a reason still clears isVerified and accepts the reason', async () => {
    await asArtisan(
      request(t.app.getHttpServer())
        .post('/api/artisans/me/profile')
        .send({ tradeType: 'PLUMBER', servicePincode: '560001' }),
    );
    const artisan = await Artisan.findOne({ where: { userId: t.artisanUserId } });
    await Artisan.update(
      { isVerified: true, documentUrl: 'artisans/x/doc.pdf' },
      { where: { id: artisan!.id } },
    );

    const res = await asAdmin(
      request(t.app.getHttpServer())
        .patch(`/api/admin/artisans/${artisan!.id}/reject-verification`)
        .send({ reason: 'Document is blurry' }),
    );
    expect(res.status).toBe(200);
    expect(res.body.data.isVerified).toBe(false);
  });
});
