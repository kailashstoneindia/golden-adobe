import request from 'supertest';

import { ArtisansTestApp, createArtisansTestApp } from './artisans-test-app';
import { Artisan } from '../models/artisan.model';
import { ArtisanHireRequest } from '../models/artisan-hire-request.model';

jest.setTimeout(60_000);

describe('AdminArtisansController (real HTTP, Postgres)', () => {
  let t: ArtisansTestApp;

  const asAdmin = (req: request.Test) => req.set('Authorization', `Bearer ${t.adminToken}`);
  const asArtisan = (req: request.Test) => req.set('Authorization', `Bearer ${t.artisanToken}`);

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
        .send({ tradeType: 'PLUMBER' }),
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
        .send({ tradeType: 'PLUMBER' }),
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
        .send({ tradeType: 'PLUMBER' }),
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

  it('admin approving a pending hire request moves it to ACCEPTED_BY_ARTISAN', async () => {
    await asArtisan(
      request(t.app.getHttpServer())
        .post('/api/artisans/me/profile')
        .send({ tradeType: 'PLUMBER' }),
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
    expect(res.body.data.status).toBe('ACCEPTED_BY_ARTISAN');
  });

  it('pending-verification is a paginated page, not a bare array', async () => {
    await asArtisan(
      request(t.app.getHttpServer())
        .post('/api/artisans/me/profile')
        .send({ tradeType: 'PLUMBER' }),
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
    expect(res.body.data.items.some((a: { id: string }) => a.id === artisan!.id)).toBe(true);
  });

  it('hire-requests/pending is a paginated page, not a bare array', async () => {
    await asArtisan(
      request(t.app.getHttpServer())
        .post('/api/artisans/me/profile')
        .send({ tradeType: 'PLUMBER' }),
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

  it('hire-requests lists every status, not just pending', async () => {
    await asArtisan(
      request(t.app.getHttpServer())
        .post('/api/artisans/me/profile')
        .send({ tradeType: 'PLUMBER' }),
    );
    const artisan = await Artisan.findOne({ where: { userId: t.artisanUserId } });
    await ArtisanHireRequest.create({
      customerId: t.customerUserId,
      artisanId: artisan!.id,
      addressText: '1 Park Lane',
      status: 'COMPLETED',
    } as never);

    const res = await asAdmin(
      request(t.app.getHttpServer()).get('/api/admin/artisans/hire-requests'),
    );
    expect(res.status).toBe(200);
    expect(res.body.data.items.some((r: { status: string }) => r.status === 'COMPLETED')).toBe(
      true,
    );
  });

  it('hire-requests?status= narrows to that one status', async () => {
    await asArtisan(
      request(t.app.getHttpServer())
        .post('/api/artisans/me/profile')
        .send({ tradeType: 'PLUMBER' }),
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
        .send({ tradeType: 'PLUMBER' }),
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
