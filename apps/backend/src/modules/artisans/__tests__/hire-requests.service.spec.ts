import { ConflictException, ForbiddenException, Logger } from '@nestjs/common';
import { SequelizeModule, getModelToken } from '@nestjs/sequelize';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@golden-abode/types';

import { ARTISAN_TEST_MODELS } from './test-db';
import { NOTIFICATION_SERVICE } from '../../notifications/notification.interface';
import { User } from '../../users/models/user.model';
import { Artisan } from '../models/artisan.model';
import { ArtisanHireRequest } from '../models/artisan-hire-request.model';
import { ArtisanCompletionEstimate } from '../models/artisan-completion-estimate.model';
import { Order } from '../../orders/models/order.model';
import { HireRequestsService } from '../hire-requests.service';
import { ARTISAN_RESPONSE_WINDOW_MS } from '../hire-request-rules';
import { findOnAnyPage } from './find-on-any-page';

describe('HireRequestsService (integration)', () => {
  let moduleRef: TestingModule;
  let service: HireRequestsService;
  let notificationsMock: { sendHireRequestStatusChanged: jest.Mock };
  // High-entropy, not just millisecond-based: this spec's own Jest worker
  // runs concurrently with the controller specs' test-app fixtures, and a
  // Date.now()-based suffix alone has collided on the phone unique
  // constraint before.
  const suffix = Math.random().toString(36).slice(2, 10);
  let adminId: string;
  let customerId: string;
  let artisanUserId: string;
  let artisanId: string;
  // Decision 0055 allows one open request per customer–ustaad pair, so a
  // test that needs several open requests with this suite's one ustaad
  // gives each its own customer.
  const extraCustomerIds: string[] = [];
  let extraCustomerCount = 0;

  async function createExtraCustomer(): Promise<string> {
    extraCustomerCount += 1;
    const user = await User.create({
      name: `Extra Customer ${extraCustomerCount} ${suffix}`,
      phone: `1${extraCustomerCount}${suffix}`.slice(0, 10),
      role: Role.CUSTOMER,
      isActive: true,
    } as never);
    extraCustomerIds.push(user.id);
    return user.id;
  }

  beforeAll(async () => {
    notificationsMock = { sendHireRequestStatusChanged: jest.fn() };

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
      providers: [
        HireRequestsService,
        { provide: NOTIFICATION_SERVICE, useValue: notificationsMock },
        // Mocked, not registered via SequelizeModule.forFeature like the
        // artisan models above: Order pulls in Customer, CustomerAddress,
        // and OrderVendorGroup's whole associated graph, which this
        // artisan-focused integration fixture has no need to stand up —
        // listAttributedOrders itself is covered by a dedicated unit spec
        // (hire-requests-attributed-orders.spec.ts), not here.
        { provide: getModelToken(Order), useValue: { findAll: jest.fn().mockResolvedValue([]) } },
      ],
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

  afterEach(async () => {
    notificationsMock.sendHireRequestStatusChanged.mockClear();
    await ArtisanHireRequest.destroy({ where: { artisanId } });
  });

  afterAll(async () => {
    await ArtisanHireRequest.destroy({ where: { artisanId } });
    await Artisan.destroy({ where: { id: artisanId } });
    await User.destroy({
      where: { id: [adminId, customerId, artisanUserId, ...extraCustomerIds] },
    });
    await moduleRef.close();
  });

  async function createHireRequestFixture(
    overrides: Partial<{ status: string; customerId: string; adminReviewedAt: Date | null }> = {},
  ): Promise<ArtisanHireRequest> {
    const status = overrides.status ?? 'PENDING_ADMIN_REVIEW';
    return ArtisanHireRequest.create({
      customerId: overrides.customerId ?? customerId,
      artisanId,
      addressText: '12 MG Road, Bengaluru',
      status,
      // A request past the admin gate was reviewed at some point; the
      // ustaad's response window runs from then (0055).
      adminReviewedAt:
        'adminReviewedAt' in overrides
          ? overrides.adminReviewedAt
          : status === 'PENDING_ADMIN_REVIEW'
            ? null
            : new Date(),
    } as never);
  }

  it('admin allow moves PENDING_ADMIN_REVIEW to PENDING_ARTISAN_RESPONSE, not ACCEPTED_BY_ARTISAN (0055)', async () => {
    const request = await createHireRequestFixture({ status: 'PENDING_ADMIN_REVIEW' });
    await expect(
      service.reviewRequest(adminId, request.id, { approve: true }),
    ).resolves.toMatchObject({ status: 'PENDING_ARTISAN_RESPONSE' });

    await expect(service.reviewRequest(adminId, request.id, { approve: true })).rejects.toThrow(
      ConflictException,
    );
  });

  it('reviewRequest approval notifies the artisan', async () => {
    const request = await createHireRequestFixture({ status: 'PENDING_ADMIN_REVIEW' });
    await service.reviewRequest(adminId, request.id, { approve: true });
    expect(notificationsMock.sendHireRequestStatusChanged).toHaveBeenCalledWith(
      artisanUserId,
      request.id,
      'PENDING_ARTISAN_RESPONSE',
    );
  });

  it('does not allow re-reviewing a rejected request', async () => {
    const request = await createHireRequestFixture({ status: 'PENDING_ADMIN_REVIEW' });
    await service.reviewRequest(adminId, request.id, {
      approve: false,
      rejectReason: 'Not a fit',
    });
    await expect(service.reviewRequest(adminId, request.id, { approve: true })).rejects.toThrow(
      ConflictException,
    );
  });

  it('excludes PENDING_ADMIN_REVIEW and ADMIN_REJECTED requests from listForArtisan', async () => {
    await createHireRequestFixture({ status: 'PENDING_ADMIN_REVIEW' });
    await createHireRequestFixture({ status: 'ADMIN_REJECTED' });
    await createHireRequestFixture({
      status: 'ACCEPTED_BY_ARTISAN',
      customerId: await createExtraCustomer(),
    });
    const list = await service.listForArtisan(artisanUserId);
    expect(list.every((r) => r.status !== 'PENDING_ADMIN_REVIEW')).toBe(true);
    expect(list.every((r) => r.status !== 'ADMIN_REJECTED')).toBe(true);
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
    const requestB = await createHireRequestFixture({
      status: 'PENDING_ADMIN_REVIEW',
      customerId: await createExtraCustomer(),
    });

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
    const pending = (p: number) => service.listPendingAdminReview(p, 100);
    const dtoA = await findOnAnyPage(pending, (r) => r.id === requestA.id);
    const dtoB = await findOnAnyPage(pending, (r) => r.id === requestB.id);
    expect(dtoA?.latestEstimate?.estimatedDays).toBe(2);
    expect(dtoB?.latestEstimate?.estimatedDays).toBe(9);
    expect(page.page).toBe(1);
    expect(page.limit).toBe(20);
    expect(page.total).toBeGreaterThanOrEqual(2);
  });

  it('startWork moves ACCEPTED_BY_ARTISAN to IN_PROGRESS and stamps startedAt', async () => {
    const request = await createHireRequestFixture({ status: 'ACCEPTED_BY_ARTISAN' });
    const result = await service.startWork(artisanUserId, request.id);
    expect(result.status).toBe('IN_PROGRESS');
    expect(result.startedAt).not.toBeNull();
  });

  it('startWork notifies the customer', async () => {
    const request = await createHireRequestFixture({ status: 'ACCEPTED_BY_ARTISAN' });
    await service.startWork(artisanUserId, request.id);
    expect(notificationsMock.sendHireRequestStatusChanged).toHaveBeenCalledWith(
      customerId,
      request.id,
      'IN_PROGRESS',
    );
  });

  it('startWork rejects a request still PENDING_ADMIN_REVIEW', async () => {
    const request = await createHireRequestFixture({ status: 'PENDING_ADMIN_REVIEW' });
    await expect(service.startWork(artisanUserId, request.id)).rejects.toThrow(ConflictException);
  });

  it('startWork rejects an artisan who does not own the request', async () => {
    const otherArtisanUser = await User.create({
      name: `Other Start Artisan ${suffix}`,
      phone: `4${suffix}`.slice(0, 10),
      role: Role.ARTISAN,
      isActive: true,
    } as never);
    const otherArtisan = await Artisan.create({
      userId: otherArtisanUser.id,
      tradeType: 'MASON',
      isVerified: true,
    } as never);

    const request = await createHireRequestFixture({ status: 'ACCEPTED_BY_ARTISAN' });
    await expect(service.startWork(otherArtisanUser.id, request.id)).rejects.toThrow(
      ForbiddenException,
    );

    await Artisan.destroy({ where: { id: otherArtisan.id } });
    await User.destroy({ where: { id: otherArtisanUser.id } });
  });

  it('completeWork moves IN_PROGRESS to COMPLETED and stamps completedAt', async () => {
    const request = await createHireRequestFixture({ status: 'IN_PROGRESS' });
    const result = await service.completeWork(artisanUserId, request.id);
    expect(result.status).toBe('COMPLETED');
    expect(result.completedAt).not.toBeNull();
  });

  it('completeWork notifies the customer', async () => {
    const request = await createHireRequestFixture({ status: 'IN_PROGRESS' });
    await service.completeWork(artisanUserId, request.id);
    expect(notificationsMock.sendHireRequestStatusChanged).toHaveBeenCalledWith(
      customerId,
      request.id,
      'COMPLETED',
    );
  });

  it('completeWork rejects a request that is not yet IN_PROGRESS', async () => {
    const request = await createHireRequestFixture({ status: 'ACCEPTED_BY_ARTISAN' });
    await expect(service.completeWork(artisanUserId, request.id)).rejects.toThrow(
      ConflictException,
    );
  });

  it('cancel moves PENDING_ADMIN_REVIEW, ACCEPTED_BY_ARTISAN, or IN_PROGRESS to CANCELLED', async () => {
    for (const status of [
      'PENDING_ADMIN_REVIEW',
      'PENDING_ARTISAN_RESPONSE',
      'ACCEPTED_BY_ARTISAN',
      'IN_PROGRESS',
    ]) {
      const request = await createHireRequestFixture({ status });
      const result = await service.cancel(customerId, Role.CUSTOMER, request.id, {
        reason: 'Changed my mind',
      });
      expect(result.status).toBe('CANCELLED');
      expect(result.cancelledAt).not.toBeNull();
      expect(result.cancelReason).toBe('Changed my mind');
    }
  });

  it('cancel rejects a request already COMPLETED', async () => {
    const request = await createHireRequestFixture({ status: 'COMPLETED' });
    await expect(
      service.cancel(customerId, Role.CUSTOMER, request.id, { reason: 'too late' }),
    ).rejects.toThrow(ConflictException);
  });

  it('cancel by the customer notifies the artisan', async () => {
    const request = await createHireRequestFixture({ status: 'ACCEPTED_BY_ARTISAN' });
    await service.cancel(customerId, Role.CUSTOMER, request.id, { reason: 'changed my mind' });
    expect(notificationsMock.sendHireRequestStatusChanged).toHaveBeenCalledWith(
      artisanUserId,
      request.id,
      'CANCELLED',
    );
  });

  it('cancel by the artisan notifies the customer', async () => {
    const request = await createHireRequestFixture({ status: 'ACCEPTED_BY_ARTISAN' });
    await service.cancel(artisanUserId, Role.ARTISAN, request.id, { reason: 'unavailable' });
    expect(notificationsMock.sendHireRequestStatusChanged).toHaveBeenCalledWith(
      customerId,
      request.id,
      'CANCELLED',
    );
  });

  it('cancel allows the owning artisan and an admin, not just the owning customer', async () => {
    const asArtisan = await createHireRequestFixture({ status: 'ACCEPTED_BY_ARTISAN' });
    await expect(
      service.cancel(artisanUserId, Role.ARTISAN, asArtisan.id, { reason: 'no longer available' }),
    ).resolves.toMatchObject({ status: 'CANCELLED' });

    const asAdmin = await createHireRequestFixture({ status: 'ACCEPTED_BY_ARTISAN' });
    await expect(
      service.cancel(adminId, Role.ADMIN, asAdmin.id, { reason: 'admin override' }),
    ).resolves.toMatchObject({ status: 'CANCELLED' });
  });

  it('cancel rejects a caller who is neither the owning customer, owning artisan, nor admin', async () => {
    const strangerUser = await User.create({
      name: `Stranger ${suffix}`,
      phone: `3${suffix}`.slice(0, 10),
      role: Role.CUSTOMER,
      isActive: true,
    } as never);

    const request = await createHireRequestFixture({ status: 'ACCEPTED_BY_ARTISAN' });
    await expect(
      service.cancel(strangerUser.id, Role.CUSTOMER, request.id, { reason: 'not mine' }),
    ).rejects.toThrow(ForbiddenException);

    await User.destroy({ where: { id: strangerUser.id } });
  });

  it('listAll returns every status when no filter is given', async () => {
    const pending = await createHireRequestFixture({ status: 'PENDING_ADMIN_REVIEW' });
    const completed = await createHireRequestFixture({ status: 'COMPLETED' });
    const all = (p: number) => service.listAll(p, 100);
    expect(await findOnAnyPage(all, (r) => r.id === pending.id)).toBeDefined();
    expect(await findOnAnyPage(all, (r) => r.id === completed.id)).toBeDefined();
  });

  it('listAll filters to a single status when given one', async () => {
    await createHireRequestFixture({ status: 'IN_PROGRESS' });
    const page = await service.listAll(1, 20, 'IN_PROGRESS');
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.every((r) => r.status === 'IN_PROGRESS')).toBe(true);
  });

  it('listPendingAdminReview attaches the artisan active-job count and team size', async () => {
    // This suite reuses one artisan fixture across many tests with no
    // per-test cleanup (only afterAll), so the active-job count already
    // includes rows other tests left behind — measure the delta two new
    // active rows cause, not an absolute count.
    const pendingBefore = await createHireRequestFixture({ status: 'PENDING_ADMIN_REVIEW' });
    const pendingPages = (p: number) => service.listPendingAdminReview(p, 100);
    const baselineRow = await findOnAnyPage(pendingPages, (r) => r.id === pendingBefore.id);
    expect(baselineRow).toBeDefined();
    const baselineCount = baselineRow?.artisanActiveJobCount ?? 0;

    await createHireRequestFixture({
      status: 'ACCEPTED_BY_ARTISAN',
      customerId: await createExtraCustomer(),
    });
    await createHireRequestFixture({
      status: 'IN_PROGRESS',
      customerId: await createExtraCustomer(),
    });
    await createHireRequestFixture({ status: 'COMPLETED' }); // not active, excluded from count
    // Already sent to the ustaad and waiting on an answer: counts as load,
    // so the admin sees it before sending them more (0055, PR #41 review).
    await createHireRequestFixture({
      status: 'PENDING_ARTISAN_RESPONSE',
      customerId: await createExtraCustomer(),
    });
    const pending = await createHireRequestFixture({
      status: 'PENDING_ADMIN_REVIEW',
      customerId: await createExtraCustomer(),
    });

    const dto = await findOnAnyPage(pendingPages, (r) => r.id === pending.id);
    expect(dto?.artisanActiveJobCount).toBe(baselineCount + 3);
    expect(dto?.artisanTeamSize).toBe(0);
  });

  it('listAll does not attach capacity info (admin review surface only)', async () => {
    const request = await createHireRequestFixture({ status: 'COMPLETED' });
    const dto = await findOnAnyPage(
      (p) => service.listAll(p, 100),
      (r) => r.id === request.id,
    );
    expect(dto?.artisanActiveJobCount).toBeNull();
    expect(dto?.artisanTeamSize).toBeNull();
  });

  it('createRequest rejects an unavailable (but verified) artisan with a 409', async () => {
    const unavailableUser = await User.create({
      name: `Unavailable Artisan ${suffix}`,
      phone: `2${suffix}`.slice(0, 10),
      role: Role.ARTISAN,
      isActive: true,
    } as never);
    const unavailableArtisan = await Artisan.create({
      userId: unavailableUser.id,
      tradeType: 'PAINTER',
      isVerified: true,
      isAvailable: false,
    } as never);

    await expect(
      service.createRequest(customerId, {
        artisanId: unavailableArtisan.id,
        addressText: 'Somewhere',
      }),
    ).rejects.toThrow(ConflictException);

    await Artisan.destroy({ where: { id: unavailableArtisan.id } });
    await User.destroy({ where: { id: unavailableUser.id } });
  });

  it('createRequest succeeds for a verified, available artisan', async () => {
    await Artisan.update({ isAvailable: true }, { where: { id: artisanId } });
    await expect(
      service.createRequest(customerId, {
        artisanId,
        addressText: 'Somewhere available',
      }),
    ).resolves.toMatchObject({ status: 'PENDING_ADMIN_REVIEW' });
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

  describe('ustaad response (0055)', () => {
    const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

    it('accept moves PENDING_ARTISAN_RESPONSE to ACCEPTED_BY_ARTISAN and notifies the customer', async () => {
      const request = await createHireRequestFixture({ status: 'PENDING_ARTISAN_RESPONSE' });
      const result = await service.acceptRequest(artisanUserId, request.id);
      expect(result.status).toBe('ACCEPTED_BY_ARTISAN');
      expect(result.artisanRespondedAt).not.toBeNull();
      expect(notificationsMock.sendHireRequestStatusChanged).toHaveBeenCalledWith(
        customerId,
        request.id,
        'ACCEPTED_BY_ARTISAN',
      );
    });

    it('accept rejects an ustaad who does not own the request', async () => {
      const otherUser = await User.create({
        name: `Other Accept Artisan ${suffix}`,
        phone: `0${suffix}`.slice(0, 10),
        role: Role.ARTISAN,
        isActive: true,
      } as never);
      const other = await Artisan.create({
        userId: otherUser.id,
        tradeType: 'MASON',
        isVerified: true,
      } as never);

      const request = await createHireRequestFixture({ status: 'PENDING_ARTISAN_RESPONSE' });
      await expect(service.acceptRequest(otherUser.id, request.id)).rejects.toThrow(
        ForbiddenException,
      );

      await Artisan.destroy({ where: { id: other.id } });
      await User.destroy({ where: { id: otherUser.id } });
    });

    it('accept rejects a request that is not waiting on the ustaad', async () => {
      for (const status of ['PENDING_ADMIN_REVIEW', 'ACCEPTED_BY_ARTISAN', 'ARTISAN_DECLINED']) {
        const request = await createHireRequestFixture({ status });
        await expect(service.acceptRequest(artisanUserId, request.id)).rejects.toThrow(
          ConflictException,
        );
        await request.destroy();
      }
    });

    it('accept and decline both fail once the 48-hour window has passed, even before the sweep', async () => {
      const request = await createHireRequestFixture({
        status: 'PENDING_ARTISAN_RESPONSE',
        adminReviewedAt: hoursAgo(49),
      });
      await expect(service.acceptRequest(artisanUserId, request.id)).rejects.toThrow(
        ConflictException,
      );
      await expect(
        service.declineRequest(artisanUserId, request.id, { reason: 'busy' }),
      ).rejects.toThrow(ConflictException);
      await request.reload();
      expect(request.status).toBe('PENDING_ARTISAN_RESPONSE');
    });

    it('decline moves PENDING_ARTISAN_RESPONSE to ARTISAN_DECLINED with the reason and notifies the customer', async () => {
      const request = await createHireRequestFixture({ status: 'PENDING_ARTISAN_RESPONSE' });
      const result = await service.declineRequest(artisanUserId, request.id, {
        reason: 'No bandwidth this week',
      });
      expect(result.status).toBe('ARTISAN_DECLINED');
      expect(result.artisanDeclineReason).toBe('No bandwidth this week');
      expect(result.artisanRespondedAt).not.toBeNull();
      expect(notificationsMock.sendHireRequestStatusChanged).toHaveBeenCalledWith(
        customerId,
        request.id,
        'ARTISAN_DECLINED',
      );
    });

    it('the ustaad cannot cancel a request waiting on them (they decline instead); the customer can', async () => {
      const request = await createHireRequestFixture({ status: 'PENDING_ARTISAN_RESPONSE' });
      await expect(
        service.cancel(artisanUserId, Role.ARTISAN, request.id, { reason: 'nope' }),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.cancel(customerId, Role.CUSTOMER, request.id, { reason: 'found someone' }),
      ).resolves.toMatchObject({ status: 'CANCELLED' });
    });

    it('expireStaleResponses expires only requests past the window and notifies both sides', async () => {
      const stale = await createHireRequestFixture({
        status: 'PENDING_ARTISAN_RESPONSE',
        adminReviewedAt: hoursAgo(49),
      });
      const fresh = await createHireRequestFixture({
        status: 'PENDING_ARTISAN_RESPONSE',
        adminReviewedAt: hoursAgo(47),
        customerId: await createExtraCustomer(),
      });

      const expired = await service.expireStaleResponses();
      expect(expired).toBeGreaterThanOrEqual(1);

      await stale.reload();
      await fresh.reload();
      expect(stale.status).toBe('EXPIRED');
      expect(fresh.status).toBe('PENDING_ARTISAN_RESPONSE');
      expect(notificationsMock.sendHireRequestStatusChanged).toHaveBeenCalledWith(
        customerId,
        stale.id,
        'EXPIRED',
      );
      expect(notificationsMock.sendHireRequestStatusChanged).toHaveBeenCalledWith(
        artisanUserId,
        stale.id,
        'EXPIRED',
      );
    });

    it('artisanResponseDueAt is 48 hours after admin allowed it, and only while waiting', async () => {
      const reviewedAt = hoursAgo(10);
      await createHireRequestFixture({
        status: 'PENDING_ARTISAN_RESPONSE',
        adminReviewedAt: reviewedAt,
      });
      await createHireRequestFixture({
        status: 'IN_PROGRESS',
        customerId: await createExtraCustomer(),
      });
      const list = await service.listForArtisan(artisanUserId);
      const waiting = list.find((r) => r.status === 'PENDING_ARTISAN_RESPONSE');
      const working = list.find((r) => r.status === 'IN_PROGRESS');
      expect(waiting?.artisanResponseDueAt).toBe(
        new Date(reviewedAt.getTime() + ARTISAN_RESPONSE_WINDOW_MS).toISOString(),
      );
      expect(working?.artisanResponseDueAt).toBeNull();
    });
  });

  describe('admin lists show who is involved (0058)', () => {
    const ALL_STATUSES = [
      'PENDING_ADMIN_REVIEW',
      'ADMIN_REJECTED',
      'PENDING_ARTISAN_RESPONSE',
      'ARTISAN_DECLINED',
      'EXPIRED',
      'ACCEPTED_BY_ARTISAN',
      'IN_PROGRESS',
      'COMPLETED',
      'CANCELLED',
    ];

    it('carry customer contact and ustaad name and phone in every status', async () => {
      for (const status of ALL_STATUSES) {
        const request = await createHireRequestFixture({ status });
        const dto = (await service.listAll(1, 100)).items.find((r) => r.id === request.id);

        expect(dto?.customer).toMatchObject({
          userId: customerId,
          name: `Customer HR Test ${suffix}`,
          phone: `8${suffix}`.slice(0, 10),
          role: Role.CUSTOMER,
        });
        expect(dto?.customerName).toBe(`Customer HR Test ${suffix}`);
        expect(dto?.customerPhone).toBe(`8${suffix}`.slice(0, 10));
        expect(dto?.artisan).toMatchObject({
          userId: artisanUserId,
          name: `Artisan HR Test ${suffix}`,
          phone: `9${suffix}`.slice(0, 10),
        });
        expect(dto?.artisanTradeType).toBe('PLUMBER');
        await request.destroy();
      }
    });

    it('never carry the ustaad email', async () => {
      await User.update({ email: `ustaad-${suffix}@test.local` }, { where: { id: artisanUserId } });
      const request = await createHireRequestFixture({ status: 'PENDING_ADMIN_REVIEW' });

      const dto = await findOnAnyPage(
        (p) => service.listPendingAdminReview(p, 100),
        (r) => r.id === request.id,
      );

      expect(dto).toBeDefined();
      expect(dto?.artisan).not.toHaveProperty('email');
      await User.update({ email: null }, { where: { id: artisanUserId } });
    });

    it('carry the reviewer name and how many estimates were given', async () => {
      const request = await createHireRequestFixture({ status: 'PENDING_ADMIN_REVIEW' });
      await service.reviewRequest(adminId, request.id, { approve: true });
      await request.reload();
      await request.update({ status: 'IN_PROGRESS' } as never);
      await ArtisanCompletionEstimate.create({
        hireRequestId: request.id,
        estimatedDays: 5,
        // A second earlier, so "latest" never depends on two inserts in one millisecond.
        createdAt: new Date(Date.now() - 1000),
      } as never);
      await ArtisanCompletionEstimate.create({
        hireRequestId: request.id,
        estimatedDays: 7,
      } as never);
      const admin = await User.findByPk(adminId);

      const dto = (await service.listAll(1, 100)).items.find((r) => r.id === request.id);

      expect(dto?.adminReviewerName).toBe(admin!.name);
      expect(dto?.estimateCount).toBe(2);
      expect(dto?.latestEstimate?.estimatedDays).toBe(7);
    });
  });

  describe('customer contact for the ustaad (0055)', () => {
    it('is shown while waiting, accepted or in progress', async () => {
      for (const status of ['PENDING_ARTISAN_RESPONSE', 'ACCEPTED_BY_ARTISAN', 'IN_PROGRESS']) {
        const request = await createHireRequestFixture({ status });
        const dto = (await service.listForArtisan(artisanUserId)).find((r) => r.id === request.id);
        expect(dto?.customerName).toBe(`Customer HR Test ${suffix}`);
        expect(dto?.customerPhone).toBe(`8${suffix}`.slice(0, 10));
        await request.destroy();
      }
    });

    it('is hidden once the request is declined, expired, cancelled or completed', async () => {
      for (const status of ['ARTISAN_DECLINED', 'EXPIRED', 'CANCELLED', 'COMPLETED']) {
        const request = await createHireRequestFixture({ status });
        const dto = (await service.listForArtisan(artisanUserId)).find((r) => r.id === request.id);
        expect(dto?.customerName).toBeNull();
        expect(dto?.customerPhone).toBeNull();
      }
    });

    it('is also carried on the accept response so the ustaad keeps it after accepting', async () => {
      const request = await createHireRequestFixture({ status: 'PENDING_ARTISAN_RESPONSE' });
      const result = await service.acceptRequest(artisanUserId, request.id);
      expect(result.customerPhone).toBe(`8${suffix}`.slice(0, 10));
    });
  });

  describe('one open request per customer–ustaad pair (0055)', () => {
    beforeEach(async () => {
      await Artisan.update({ isAvailable: true }, { where: { id: artisanId } });
    });

    it('rejects a second open request to the same ustaad', async () => {
      for (const status of [
        'PENDING_ADMIN_REVIEW',
        'PENDING_ARTISAN_RESPONSE',
        'ACCEPTED_BY_ARTISAN',
        'IN_PROGRESS',
      ]) {
        const open = await createHireRequestFixture({ status });
        await expect(
          service.createRequest(customerId, { artisanId, addressText: 'Again' }),
        ).rejects.toThrow(ConflictException);
        await open.destroy();
      }
    });

    it('allows asking the same ustaad again once the earlier request has ended', async () => {
      for (const status of [
        'ARTISAN_DECLINED',
        'EXPIRED',
        'ADMIN_REJECTED',
        'CANCELLED',
        'COMPLETED',
      ]) {
        await createHireRequestFixture({ status });
      }
      await expect(
        service.createRequest(customerId, { artisanId, addressText: 'Second try' }),
      ).resolves.toMatchObject({ status: 'PENDING_ADMIN_REVIEW' });
    });

    it('the database index blocks a duplicate open request even if the service check is bypassed', async () => {
      await createHireRequestFixture({ status: 'PENDING_ADMIN_REVIEW' });
      await expect(createHireRequestFixture({ status: 'IN_PROGRESS' })).rejects.toThrow();
    });
  });

  describe('code review fixes (PR #41)', () => {
    const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

    it('the ustaad never sees a request cancelled before the admin reviewed it', async () => {
      const cancelledEarly = await createHireRequestFixture({
        status: 'CANCELLED',
        adminReviewedAt: null,
      });
      const cancelledLate = await createHireRequestFixture({
        status: 'CANCELLED',
        adminReviewedAt: new Date(),
      });
      const ids = (await service.listForArtisan(artisanUserId)).map((r) => r.id);
      expect(ids).not.toContain(cancelledEarly.id);
      expect(ids).toContain(cancelledLate.id);
    });

    it('cancelling before admin review does not notify the ustaad', async () => {
      const request = await createHireRequestFixture({ status: 'PENDING_ADMIN_REVIEW' });
      await service.cancel(customerId, Role.CUSTOMER, request.id, { reason: 'changed my mind' });
      expect(notificationsMock.sendHireRequestStatusChanged).not.toHaveBeenCalledWith(
        artisanUserId,
        request.id,
        'CANCELLED',
      );
    });

    it('the ustaad gets 403, not 409, cancelling a request the admin has not sent them', async () => {
      const request = await createHireRequestFixture({ status: 'PENDING_ADMIN_REVIEW' });
      await expect(
        service.cancel(artisanUserId, Role.ARTISAN, request.id, { reason: 'peek' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('one failed expiry notification does not stop the others', async () => {
      const first = await createHireRequestFixture({
        status: 'PENDING_ARTISAN_RESPONSE',
        adminReviewedAt: hoursAgo(50),
      });
      const secondCustomer = await createExtraCustomer();
      const second = await createHireRequestFixture({
        status: 'PENDING_ARTISAN_RESPONSE',
        adminReviewedAt: hoursAgo(50),
        customerId: secondCustomer,
      });
      notificationsMock.sendHireRequestStatusChanged.mockRejectedValueOnce(new Error('push down'));

      await expect(service.expireStaleResponses()).resolves.toBeGreaterThanOrEqual(2);

      const notifiedIds = notificationsMock.sendHireRequestStatusChanged.mock.calls.map(
        (call) => call[1],
      );
      expect(notifiedIds).toEqual(expect.arrayContaining([first.id, second.id]));
      // Both sides for both rows were attempted, even though the first call threw.
      expect(
        notificationsMock.sendHireRequestStatusChanged.mock.calls.filter(
          (call) => call[2] === 'EXPIRED',
        ).length,
      ).toBeGreaterThanOrEqual(4);
    });

    it('a lost race on accept is not reported as the window having passed', async () => {
      const request = await createHireRequestFixture({ status: 'PENDING_ARTISAN_RESPONSE' });
      const staleRead = await service.getRequestById(request.id);
      await service.acceptRequest(artisanUserId, request.id);

      const spy = jest.spyOn(service, 'getRequestById').mockResolvedValueOnce(staleRead);
      const second = service.acceptRequest(artisanUserId, request.id);
      await expect(second).rejects.toThrow(ConflictException);
      await expect(second).rejects.not.toThrow(/time to respond/);
      spy.mockRestore();
    });
  });

  // Whole-branch review: every admin write logs who did what.
  describe('admin audit log', () => {
    const adminLines = (spy: jest.SpyInstance) =>
      spy.mock.calls.map((call) => String(call[0])).filter((line) => line.startsWith('admin '));

    afterEach(() => jest.restoreAllMocks());

    it('logs an admin cancelling a request, with the fields that changed', async () => {
      const request = await createHireRequestFixture({ status: 'IN_PROGRESS' });
      const log = jest.spyOn(Logger.prototype, 'log');

      await service.cancel(adminId, Role.ADMIN, request.id, { reason: 'admin override' });

      expect(adminLines(log)).toEqual([
        `admin ${adminId} cancel hire-request ${request.id} status,cancelledAt,cancelReason`,
      ]);
    });

    it('does not log a customer cancelling their own request as an admin action', async () => {
      const request = await createHireRequestFixture({ status: 'ACCEPTED_BY_ARTISAN' });
      const log = jest.spyOn(Logger.prototype, 'log');

      await service.cancel(customerId, Role.CUSTOMER, request.id, { reason: 'changed my mind' });

      expect(adminLines(log)).toEqual([]);
    });

    it('does not log an ustaad cancelling their own job as an admin action', async () => {
      const request = await createHireRequestFixture({ status: 'ACCEPTED_BY_ARTISAN' });
      const log = jest.spyOn(Logger.prototype, 'log');

      await service.cancel(artisanUserId, Role.ARTISAN, request.id, { reason: 'not available' });

      expect(adminLines(log)).toEqual([]);
    });

    it('logs nothing when an admin cancel is refused', async () => {
      const request = await createHireRequestFixture({ status: 'COMPLETED' });
      const log = jest.spyOn(Logger.prototype, 'log');

      await expect(
        service.cancel(adminId, Role.ADMIN, request.id, { reason: 'too late' }),
      ).rejects.toThrow(ConflictException);

      expect(adminLines(log)).toEqual([]);
    });

    it('logs an admin approving a request', async () => {
      const request = await createHireRequestFixture({ status: 'PENDING_ADMIN_REVIEW' });
      const log = jest.spyOn(Logger.prototype, 'log');

      await service.reviewRequest(adminId, request.id, { approve: true });

      expect(adminLines(log)).toEqual([
        `admin ${adminId} approve hire-request ${request.id} status,adminReviewedBy,adminReviewedAt`,
      ]);
    });

    it('logs an admin rejecting a request, with the reason field', async () => {
      const request = await createHireRequestFixture({ status: 'PENDING_ADMIN_REVIEW' });
      const log = jest.spyOn(Logger.prototype, 'log');

      await service.reviewRequest(adminId, request.id, { approve: false, rejectReason: 'no' });

      expect(adminLines(log)).toEqual([
        `admin ${adminId} reject hire-request ${request.id} status,adminReviewedBy,adminReviewedAt,adminRejectReason`,
      ]);
    });
  });
});
