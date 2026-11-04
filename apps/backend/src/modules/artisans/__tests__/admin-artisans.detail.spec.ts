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

    expect((await detail()).documentViewUrl).toBe(`https://signed.example.test/${key}?expires=300`);
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
    for (const status of ['IN_PROGRESS', 'COMPLETED', 'COMPLETED', 'ARTISAN_DECLINED']) {
      await ArtisanHireRequest.create({
        customerId: t.customerUserId,
        artisanId,
        addressText: '1 Park Lane',
        status,
      } as never);
    }

    const dto = await detail();

    expect(dto.owner).toMatchObject({
      userId: t.artisanUserId,
      email: 'ustaad@test.local',
      role: 'ARTISAN',
    });
    expect(dto.owner).not.toHaveProperty('deviceToken');
    expect(dto.jobCounts).toEqual({ active: 1, completed: 2, declined: 1, total: 4 });
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
