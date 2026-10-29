import { ConflictException } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@golden-abode/types';

import { ARTISAN_TEST_MODELS } from './test-db';
import { User } from '../../users/models/user.model';
import { Artisan } from '../models/artisan.model';
import { ArtisanHireRequest } from '../models/artisan-hire-request.model';
import { ArtisanCompletionEstimate } from '../models/artisan-completion-estimate.model';
import { HireRequestsService } from '../hire-requests.service';

describe('HireRequestsService (integration)', () => {
  let moduleRef: TestingModule;
  let service: HireRequestsService;
  // High-entropy, not just millisecond-based: this spec's own Jest worker
  // runs concurrently with the controller specs' test-app fixtures, and a
  // Date.now()-based suffix alone has collided on the phone unique
  // constraint before.
  const suffix = Math.random().toString(36).slice(2, 10);
  let adminId: string;
  let customerId: string;
  let artisanUserId: string;
  let artisanId: string;

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
          models: ARTISAN_TEST_MODELS,
        }),
        SequelizeModule.forFeature([Artisan, ArtisanHireRequest, ArtisanCompletionEstimate]),
      ],
      providers: [HireRequestsService],
    }).compile();

    service = moduleRef.get(HireRequestsService);

    const admin = await User.create({
      name: `Admin ${suffix}`,
      phone: `7${suffix}`.slice(0, 10),
      role: Role.ADMIN,
      isActive: true,
    } as never);
    adminId = admin.id;

    const customer = await User.create({
      name: `Customer HR Test ${suffix}`,
      phone: `8${suffix}`.slice(0, 10),
      role: Role.CUSTOMER,
      isActive: true,
    } as never);
    customerId = customer.id;

    const artisanUser = await User.create({
      name: `Artisan HR Test ${suffix}`,
      phone: `9${suffix}`.slice(0, 10),
      role: Role.ARTISAN,
      isActive: true,
    } as never);
    artisanUserId = artisanUser.id;

    const artisan = await Artisan.create({
      userId: artisanUserId,
      tradeType: 'PLUMBER',
      isVerified: true,
    } as never);
    artisanId = artisan.id;
  });

  afterAll(async () => {
    await ArtisanHireRequest.destroy({ where: { artisanId } });
    await Artisan.destroy({ where: { id: artisanId } });
    await User.destroy({ where: { id: [adminId, customerId, artisanUserId] } });
    await moduleRef.close();
  });

  async function createHireRequestFixture(
    overrides: Partial<{ status: string }> = {},
  ): Promise<ArtisanHireRequest> {
    return ArtisanHireRequest.create({
      customerId,
      artisanId,
      addressText: '12 MG Road, Bengaluru',
      status: overrides.status ?? 'PENDING_ADMIN_REVIEW',
    } as never);
  }

  it('never transitions PENDING_ADMIN_REVIEW directly to IN_PROGRESS or COMPLETED', async () => {
    const request = await createHireRequestFixture({ status: 'PENDING_ADMIN_REVIEW' });
    await expect(
      service.reviewRequest(adminId, request.id, { approve: true }),
    ).resolves.toMatchObject({ status: 'ACCEPTED_BY_ARTISAN' });

    await expect(
      service.reviewRequest(adminId, request.id, { approve: true }),
    ).rejects.toThrow(ConflictException);
  });

  it('does not allow re-reviewing a rejected request', async () => {
    const request = await createHireRequestFixture({ status: 'PENDING_ADMIN_REVIEW' });
    await service.reviewRequest(adminId, request.id, {
      approve: false,
      rejectReason: 'Not a fit',
    });
    await expect(
      service.reviewRequest(adminId, request.id, { approve: true }),
    ).rejects.toThrow(ConflictException);
  });

  it('excludes PENDING_ADMIN_REVIEW requests from listForArtisan', async () => {
    await createHireRequestFixture({ status: 'PENDING_ADMIN_REVIEW' });
    await createHireRequestFixture({ status: 'ACCEPTED_BY_ARTISAN' });
    const list = await service.listForArtisan(artisanUserId);
    expect(list.every((r) => r.status !== 'PENDING_ADMIN_REVIEW')).toBe(true);
    expect(list.some((r) => r.status === 'ACCEPTED_BY_ARTISAN')).toBe(true);
  });

  it('keeps prior estimates when a new one is added', async () => {
    const request = await createHireRequestFixture({ status: 'ACCEPTED_BY_ARTISAN' });
    await service.addEstimate(artisanUserId, request.id, { estimatedDays: 5 });
    await service.addEstimate(artisanUserId, request.id, {
      estimatedDays: 8,
      note: 'Found water damage',
    });
    const history = await service.getEstimateHistory(request.id);
    expect(history).toHaveLength(2);
    expect(history.map((e) => e.estimatedDays)).toEqual([5, 8]);
  });

  it('rejects addEstimate while the request is still PENDING_ADMIN_REVIEW', async () => {
    const request = await createHireRequestFixture({ status: 'PENDING_ADMIN_REVIEW' });
    await expect(
      service.addEstimate(artisanUserId, request.id, { estimatedDays: 3 }),
    ).rejects.toThrow();
  });

  it('rejects addEstimate once the request has closed out', async () => {
    const request = await createHireRequestFixture({ status: 'COMPLETED' });
    await expect(
      service.addEstimate(artisanUserId, request.id, { estimatedDays: 3 }),
    ).rejects.toThrow();
  });

  it('allows addEstimate while IN_PROGRESS, not just ACCEPTED_BY_ARTISAN', async () => {
    const request = await createHireRequestFixture({ status: 'IN_PROGRESS' });
    await expect(
      service.addEstimate(artisanUserId, request.id, { estimatedDays: 4 }),
    ).resolves.toMatchObject({ estimatedDays: 4 });
  });

  it('rejects addEstimate from an artisan who does not own the request', async () => {
    const otherArtisanUser = await User.create({
      name: `Other Artisan ${suffix}`,
      phone: `6${suffix}`.slice(0, 10),
      role: Role.ARTISAN,
      isActive: true,
    } as never);
    const otherArtisan = await Artisan.create({
      userId: otherArtisanUser.id,
      tradeType: 'MASON',
      isVerified: true,
    } as never);

    const request = await createHireRequestFixture({ status: 'ACCEPTED_BY_ARTISAN' });
    await expect(
      service.addEstimate(otherArtisanUser.id, request.id, { estimatedDays: 3 }),
    ).rejects.toThrow();

    await Artisan.destroy({ where: { id: otherArtisan.id } });
    await User.destroy({ where: { id: otherArtisanUser.id } });
  });

  it('listPendingAdminReview paginates and attaches each request its own latest estimate', async () => {
    const requestA = await createHireRequestFixture({ status: 'PENDING_ADMIN_REVIEW' });
    const requestB = await createHireRequestFixture({ status: 'PENDING_ADMIN_REVIEW' });

    // Estimates only attach to non-pending requests in the real flow, but
    // the batching in withLatestEstimates doesn't care about status —
    // this exercises that each request gets back its OWN latest
    // estimate, not another request's, once estimates exist for both.
    await ArtisanCompletionEstimate.create({
      hireRequestId: requestA.id,
      estimatedDays: 2,
    } as never);
    await ArtisanCompletionEstimate.create({
      hireRequestId: requestB.id,
      estimatedDays: 9,
    } as never);

    const page = await service.listPendingAdminReview(1, 20);
    const dtoA = page.items.find((r) => r.id === requestA.id);
    const dtoB = page.items.find((r) => r.id === requestB.id);
    expect(dtoA?.latestEstimate?.estimatedDays).toBe(2);
    expect(dtoB?.latestEstimate?.estimatedDays).toBe(9);
    expect(page.page).toBe(1);
    expect(page.limit).toBe(20);
    expect(page.total).toBeGreaterThanOrEqual(2);
  });

  it('createRequest throws for an unverified artisan', async () => {
    const unverifiedUser = await User.create({
      name: `Unverified Artisan ${suffix}`,
      phone: `5${suffix}`.slice(0, 10),
      role: Role.ARTISAN,
      isActive: true,
    } as never);
    const unverifiedArtisan = await Artisan.create({
      userId: unverifiedUser.id,
      tradeType: 'PAINTER',
      isVerified: false,
    } as never);

    await expect(
      service.createRequest(customerId, {
        artisanId: unverifiedArtisan.id,
        addressText: 'Somewhere',
      }),
    ).rejects.toThrow();

    await Artisan.destroy({ where: { id: unverifiedArtisan.id } });
    await User.destroy({ where: { id: unverifiedUser.id } });
  });
});
