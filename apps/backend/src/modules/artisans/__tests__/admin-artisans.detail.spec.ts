import request from 'supertest';

import { ArtisansTestApp, createArtisansTestApp } from './artisans-test-app';
import { findOnAnyPage } from './find-on-any-page';
import { Artisan } from '../models/artisan.model';
import { ArtisanHireRequest } from '../models/artisan-hire-request.model';
import { ArtisanTeamMember } from '../models/artisan-team-member.model';
import { User } from '../../users/models/user.model';

jest.setTimeout(60_000);

// Decision 0058 Task 6: the admin sees who an ustaad is, their team, and can
// open their documents through short-lived signed links.
describe('Admin ustaad detail (real HTTP, Postgres)', () => {
  let t: ArtisansTestApp;
  let artisanId: string;
  const server = () => t.app.getHttpServer();
  const asAdmin = (req: request.Test) => req.set('Authorization', `Bearer ${t.adminToken}`);
  const asArtisan = (req: request.Test) => req.set('Authorization', `Bearer ${t.artisanToken}`);

  beforeAll(async () => {
    t = await createArtisansTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    const res = await asArtisan(
      request(server())
        .post('/api/artisans/me/profile')
        .send({ tradeType: 'MASON', servicePincode: '560001' }),
    );
    artisanId = res.body.data.id;
  });

  afterEach(async () => {
    await ArtisanHireRequest.destroy({ where: { artisanId } });
    await ArtisanTeamMember.destroy({ where: { artisanId } });
    await Artisan.destroy({ where: { id: artisanId } });
    await User.update({ email: null }, { where: { id: t.artisanUserId } });
  });

  const detail = async () =>
    (await asAdmin(request(server()).get(`/api/admin/artisans/${artisanId}`))).body.data;

  it('signs a short-lived link for the ustaad’s own document', async () => {
    const key = `artisans/${artisanId}/id-card.pdf`;
    t.storage.seed(key);
    await asArtisan(request(server()).post('/api/artisans/me/documents/confirm').send({ key }));

    const dto = await detail();
    expect(dto.documentViewUrl).toBe(`https://signed.example.test/${key}?expires=300`);
    expect(dto.documentLinks).toBe('ok');
    expect(dto.documentMissing).toBe(false);
  });

  it('signs a link for each team member’s document', async () => {
    const key = `artisans/${artisanId}/helper.pdf`;
    t.storage.seed(key);
    await asArtisan(
      request(server()).post('/api/artisans/me/team').send({ name: 'Ramesh', documentUrl: key }),
    );

    const [member] = (await detail()).team;
    expect(member.name).toBe('Ramesh');
    expect(member.documentViewUrl).toBe(`https://signed.example.test/${key}?expires=300`);
  });

  it('passes an older stored http link through unchanged', async () => {
    await Artisan.update(
      { documentUrl: 'https://legacy.example.test/doc.pdf' },
      { where: { id: artisanId } },
    );

    expect((await detail()).documentViewUrl).toBe('https://legacy.example.test/doc.pdf');
  });

  it('has no link when there is no document', async () => {
    expect((await detail()).documentViewUrl).toBeNull();
  });

  it('carries the owner’s contact, approval and job counts', async () => {
    await User.update({ email: 'ustaad@test.local' }, { where: { id: t.artisanUserId } });
    // One customer per request: only one open request per customer–ustaad pair.
    const customers: string[] = [];
    const hire = async (forArtisan: string, status: string) => {
      const customer = await User.create({
        name: 'Job count customer',
        phone: `4${Math.floor(Math.random() * 1e9)}`.padEnd(10, '0').slice(0, 10),
        role: 'CUSTOMER',
        isActive: true,
      } as never);
      customers.push(customer.id);
      await ArtisanHireRequest.create({
        customerId: customer.id,
        artisanId: forArtisan,
        addressText: '1 Park Lane',
        status,
      } as never);
    };
    for (const status of [
      'PENDING_ARTISAN_RESPONSE',
      'ACCEPTED_BY_ARTISAN',
      'IN_PROGRESS',
      'COMPLETED',
      'COMPLETED',
      'ARTISAN_DECLINED',
      'EXPIRED',
      'CANCELLED',
      'PENDING_ADMIN_REVIEW',
    ]) {
      await hire(artisanId, status);
    }
    // Another ustaad's job must not leak into this ustaad's counts.
    const other = await t.newArtisanUser();
    const otherArtisan = await Artisan.create({ userId: other.id, tradeType: 'PLUMBER' } as never);
    await hire(otherArtisan.id, 'IN_PROGRESS');

    const dto = await detail();

    expect(dto.owner).toMatchObject({
      userId: t.artisanUserId,
      email: 'ustaad@test.local',
      role: 'ARTISAN',
    });
    expect(dto.owner).not.toHaveProperty('deviceToken');
    expect(dto.jobCounts).toEqual({
      active: 3,
      completed: 2,
      declined: 1,
      expired: 1,
      other: 2,
      total: 9,
    });
    await ArtisanHireRequest.destroy({ where: { artisanId: otherArtisan.id } });
    await otherArtisan.destroy();
    await ArtisanHireRequest.destroy({ where: { artisanId } });
    await User.destroy({ where: { id: customers } });
  });

  it('never signs links in lists, but carries the owner there too', async () => {
    const key = `artisans/${artisanId}/id-card.pdf`;
    t.storage.seed(key);
    await asArtisan(request(server()).post('/api/artisans/me/documents/confirm').send({ key }));

    const row = await findOnAnyPage(
      async (page) =>
        (await asAdmin(request(server()).get(`/api/admin/artisans?page=${page}&limit=100`))).body
          .data,
      (item: { id: string }) => item.id === artisanId,
    );

    expect(row).toMatchObject({ documentViewUrl: null, owner: { userId: t.artisanUserId } });
  });
});

describe('Admin ustaad detail document states', () => {
  let t: ArtisansTestApp;
  let artisanId: string;
  const detail = async () =>
    request(t.app.getHttpServer())
      .get(`/api/admin/artisans/${artisanId}`)
      .set('Authorization', `Bearer ${t.adminToken}`);

  beforeAll(async () => {
    t = await createArtisansTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    const res = await request(t.app.getHttpServer())
      .post('/api/artisans/me/profile')
      .set('Authorization', `Bearer ${t.artisanToken}`)
      .send({ tradeType: 'MASON', servicePincode: '560001' });
    artisanId = res.body.data.id;
    const key = `artisans/${artisanId}/id.pdf`;
    t.storage.seed(key);
    await Artisan.update({ documentUrl: key }, { where: { id: artisanId } });
    await ArtisanTeamMember.create({
      artisanId,
      name: 'Old Helper',
      documentUrl: 'https://legacy.example.test/old.pdf',
    } as never);
  });

  afterEach(async () => {
    t.storageConfig.enabled = true;
    t.storage.failSigning = false;
    await ArtisanTeamMember.destroy({ where: { artisanId } });
    await Artisan.destroy({ where: { id: artisanId } });
  });

  it('with no bucket configured, says so without trying to sign', async () => {
    t.storageConfig.enabled = false;
    const before = t.storage.presignGetCalls;

    const res = await detail();

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      documentUrl: `artisans/${artisanId}/id.pdf`,
      documentViewUrl: null,
      documentLinks: 'storage_not_configured',
    });
    expect(t.storage.presignGetCalls).toBe(before);
    // An older document stored as a full URL needs no signing, so it still opens.
    expect(res.body.data.team[0].documentViewUrl).toBe('https://legacy.example.test/old.pdf');
  });

  it('when signing fails although storage is configured, says the link could not be made', async () => {
    t.storage.failSigning = true;

    const res = await detail();

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ documentViewUrl: null, documentLinks: 'signing_failed' });
    expect(res.body.data.team[0].documentViewUrl).toBe('https://legacy.example.test/old.pdf');
  });

  it('marks a stored document whose file is missing', async () => {
    const missing = `artisans/${artisanId}/never-uploaded.pdf`;
    await Artisan.update({ documentUrl: missing }, { where: { id: artisanId } });

    const res = await detail();

    expect(res.body.data).toMatchObject({ documentViewUrl: null, documentMissing: true });
  });
});
