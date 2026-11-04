import request from 'supertest';

import { ArtisansTestApp, createArtisansTestApp } from './artisans-test-app';
import { Artisan } from '../models/artisan.model';
import { ArtisanAccountDetails } from '../models/artisan-account-details.model';
import { ArtisanHireRequest } from '../models/artisan-hire-request.model';
import { User } from '../../users/models/user.model';

jest.setTimeout(60_000);

describe('ArtisansController (real HTTP, Postgres)', () => {
  let t: ArtisansTestApp;

  const asArtisan = (req: request.Test) => req.set('Authorization', `Bearer ${t.artisanToken}`);
  const asCustomer = (req: request.Test) => req.set('Authorization', `Bearer ${t.customerToken}`);

  beforeAll(async () => {
    t = await createArtisansTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  afterEach(async () => {
    const artisan = await Artisan.findOne({ where: { userId: t.artisanUserId } });
    if (artisan) {
      // artisan_hire_requests has no onDelete cascade on customer_id, but
      // its artisan_id FK isn't cascaded either in this schema (LLD §2.4
      // intentionally omits onDelete there) — clear hire requests first so
      // the artisan row itself can be deleted cleanly between tests.
      await ArtisanHireRequest.destroy({ where: { artisanId: artisan.id } });
      await artisan.destroy();
    }
  });

  describe('approval gate (0059)', () => {
    it('a pending ustaad can set up their profile and upload a document', async () => {
      const pending = await t.newArtisanUser({ approved: false });
      const as = (req: request.Test) => req.set('Authorization', `Bearer ${pending.token}`);
      const server = t.app.getHttpServer();

      expect(
        (
          await as(
            request(server)
              .post('/api/artisans/me/profile')
              .send({ tradeType: 'PLUMBER', servicePincode: '560001' }),
          )
        ).status,
      ).toBe(201);
      expect((await as(request(server).get('/api/artisans/me/profile'))).status).toBe(200);
      expect(
        (await as(request(server).patch('/api/artisans/me/profile').send({ bio: 'Ten years' })))
          .status,
      ).toBe(200);
      expect(
        (
          await as(
            request(server)
              .post('/api/artisans/me/documents/upload-url')
              .send({ contentType: 'application/pdf', purpose: 'lead' }),
          )
        ).status,
      ).toBeLessThan(300);
      expect(
        (await as(request(server).post('/api/artisans/me/team').send({ name: 'Ramesh' }))).status,
      ).toBe(201);
    });

    it('a pending ustaad cannot see or act on hire requests', async () => {
      const pending = await t.newArtisanUser({ approved: false });
      const res = await request(t.app.getHttpServer())
        .get('/api/artisans/me/hire-requests')
        .set('Authorization', `Bearer ${pending.token}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ACCOUNT_NOT_APPROVED');
    });

    it('approving the ustaad opens hire requests without a new login', async () => {
      const pending = await t.newArtisanUser({ approved: false });
      await request(t.app.getHttpServer())
        .post('/api/artisans/me/profile')
        .set('Authorization', `Bearer ${pending.token}`)
        .send({ tradeType: 'PLUMBER', servicePincode: '560001' });
      await User.update({ isApproved: true }, { where: { id: pending.id } });

      const res = await request(t.app.getHttpServer())
        .get('/api/artisans/me/hire-requests')
        .set('Authorization', `Bearer ${pending.token}`);

      expect(res.status).toBe(200);
    });

    it('customers are never gated', async () => {
      const res = await request(t.app.getHttpServer())
        .get('/api/artisans/hire-requests/mine')
        .set('Authorization', `Bearer ${t.customerToken}`);
      expect(res.status).toBe(200);
    });
  });

  it('answers 401 without a token', async () => {
    const res = await request(t.app.getHttpServer()).get('/api/artisans/me/profile');
    expect(res.status).toBe(401);
  });

  it('creates and reads back an artisan profile', async () => {
    const create = await asArtisan(
      request(t.app.getHttpServer())
        .post('/api/artisans/me/profile')
        .send({ tradeType: 'PLUMBER', servicePincode: '560001', bio: 'Reliable plumber' }),
    );
    expect(create.status).toBe(201);
    expect(create.body.data.tradeType).toBe('PLUMBER');

    const read = await asArtisan(request(t.app.getHttpServer()).get('/api/artisans/me/profile'));
    expect(read.status).toBe(200);
    expect(read.body.data.bio).toBe('Reliable plumber');
  });

  it('GET /artisans only returns verified artisans', async () => {
    const created = await asArtisan(
      request(t.app.getHttpServer())
        .post('/api/artisans/me/profile')
        .send({ tradeType: 'PLUMBER', servicePincode: '560001' }),
    );
    const id = created.body.data.id;

    const beforeVerify = await asCustomer(request(t.app.getHttpServer()).get('/api/artisans'));
    expect(beforeVerify.status).toBe(200);
    expect(beforeVerify.body.data.items.some((a: { id: string }) => a.id === id)).toBe(false);

    await Artisan.update(
      { isVerified: true, documentUrl: 'artisans/x/doc.pdf' },
      { where: { id } },
    );
    const afterVerify = await asCustomer(request(t.app.getHttpServer()).get('/api/artisans'));
    expect(afterVerify.body.data.items.some((a: { id: string }) => a.id === id)).toBe(true);
  });

  it('GET /artisans?tradeType=&pincode= filters results and never leaks private fields', async () => {
    const created = await asArtisan(
      request(t.app.getHttpServer())
        .post('/api/artisans/me/profile')
        .send({ tradeType: 'ELECTRICIAN', servicePincode: '400001' }),
    );
    const id = created.body.data.id;
    await Artisan.update(
      { isVerified: true, documentUrl: 'artisans/x/doc.pdf' },
      { where: { id } },
    );

    const res = await asCustomer(
      request(t.app.getHttpServer()).get('/api/artisans?tradeType=ELECTRICIAN&pincode=400001'),
    );
    expect(res.status).toBe(200);
    const found = res.body.data.items.find((a: { id: string }) => a.id === id);
    expect(found).toBeDefined();
    expect(found).not.toHaveProperty('documentUrl');
    expect(found).not.toHaveProperty('servicePincode');

    const wrongTrade = await asCustomer(
      request(t.app.getHttpServer()).get('/api/artisans?tradeType=MASON'),
    );
    expect(wrongTrade.body.data.items.some((a: { id: string }) => a.id === id)).toBe(false);
  });

  it('never returns a PENDING_ADMIN_REVIEW request from GET /artisans/me/hire-requests', async () => {
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

    await ArtisanHireRequest.create({
      customerId: t.customerUserId,
      artisanId: artisan!.id,
      addressText: '12 MG Road',
      status: 'PENDING_ADMIN_REVIEW',
    } as never);

    const res = await asArtisan(
      request(t.app.getHttpServer()).get('/api/artisans/me/hire-requests'),
    );
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('answers 404 for an unverified artisan public profile', async () => {
    const created = await asArtisan(
      request(t.app.getHttpServer())
        .post('/api/artisans/me/profile')
        .send({ tradeType: 'MASON', servicePincode: '560001' }),
    );
    const id = created.body.data.id;

    const res = await asCustomer(request(t.app.getHttpServer()).get(`/api/artisans/${id}/public`));
    expect(res.status).toBe(404);
  });

  it('never includes accountDetails in the public profile response body', async () => {
    const created = await asArtisan(
      request(t.app.getHttpServer())
        .post('/api/artisans/me/profile')
        .send({ tradeType: 'ELECTRICIAN', servicePincode: '560001' }),
    );
    const id = created.body.data.id;
    await Artisan.update(
      { isVerified: true, documentUrl: 'artisans/x/doc.pdf' },
      { where: { id } },
    );
    await ArtisanAccountDetails.create({
      artisanId: id,
      accountHolderName: 'Ramesh Kumar',
      bankName: 'SBI',
      ifscCode: 'SBIN0001234',
      branchName: 'Koramangala',
      accountNumber: '1234567890',
    } as never);

    const res = await asCustomer(request(t.app.getHttpServer()).get(`/api/artisans/${id}/public`));
    expect(res.status).toBe(200);
    expect(res.body.data).not.toHaveProperty('accountDetails');
    expect(res.body.data).not.toHaveProperty('documentUrl');
  });

  it('customer can create a hire request against a verified artisan', async () => {
    const created = await asArtisan(
      request(t.app.getHttpServer())
        .post('/api/artisans/me/profile')
        .send({ tradeType: 'PAINTER', servicePincode: '560001' }),
    );
    const id = created.body.data.id;
    await Artisan.update(
      { isVerified: true, documentUrl: 'artisans/x/doc.pdf' },
      { where: { id } },
    );

    const res = await asCustomer(
      request(t.app.getHttpServer())
        .post('/api/artisans/hire-requests')
        .send({ artisanId: id, addressText: '1 Park Lane' }),
    );
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('PENDING_ADMIN_REVIEW');
  });

  it('answers 403 when an artisan tries to create a hire request', async () => {
    const res = await asArtisan(
      request(t.app.getHttpServer())
        .post('/api/artisans/hire-requests')
        .send({ artisanId: 'not-used', addressText: 'x' }),
    );
    expect(res.status).toBe(403);
  });

  it('answers 409 when hiring a verified but unavailable artisan', async () => {
    const created = await asArtisan(
      request(t.app.getHttpServer())
        .post('/api/artisans/me/profile')
        .send({ tradeType: 'PAINTER', servicePincode: '560001' }),
    );
    const id = created.body.data.id;
    await Artisan.update(
      { isVerified: true, isAvailable: false, documentUrl: 'artisans/x/doc.pdf' },
      { where: { id } },
    );

    const res = await asCustomer(
      request(t.app.getHttpServer())
        .post('/api/artisans/hire-requests')
        .send({ artisanId: id, addressText: '1 Park Lane' }),
    );
    expect(res.status).toBe(409);
  });

  it('confirms a document upload once the object actually exists in storage', async () => {
    const created = await asArtisan(
      request(t.app.getHttpServer())
        .post('/api/artisans/me/profile')
        .send({ tradeType: 'CARPENTER', servicePincode: '560001' }),
    );
    const id = created.body.data.id;
    const key = `artisans/${id}/doc-real.pdf`;
    t.storage.seed(key);

    const res = await asArtisan(
      request(t.app.getHttpServer()).post('/api/artisans/me/documents/confirm').send({ key }),
    );
    expect(res.status).toBe(201);
    expect(res.body.data.documentUrl).toBe(key);
  });

  it('rejects confirming a document upload for a key that was never actually uploaded', async () => {
    const created = await asArtisan(
      request(t.app.getHttpServer())
        .post('/api/artisans/me/profile')
        .send({ tradeType: 'TILE_LAYING', servicePincode: '560001' }),
    );
    const id = created.body.data.id;
    const key = `artisans/${id}/doc-never-uploaded.pdf`;

    const res = await asArtisan(
      request(t.app.getHttpServer()).post('/api/artisans/me/documents/confirm').send({ key }),
    );
    expect(res.status).toBe(400);

    const read = await asArtisan(request(t.app.getHttpServer()).get('/api/artisans/me/profile'));
    expect(read.body.data.documentUrl).toBeNull();
  });

  it('answers 403 when the artisan tries to read estimate history for a request still PENDING_ADMIN_REVIEW', async () => {
    await asArtisan(
      request(t.app.getHttpServer())
        .post('/api/artisans/me/profile')
        .send({ tradeType: 'MASON', servicePincode: '560001' }),
    );
    const artisan = await Artisan.findOne({ where: { userId: t.artisanUserId } });
    const hireRequest = await ArtisanHireRequest.create({
      customerId: t.customerUserId,
      artisanId: artisan!.id,
      addressText: '1 Park Lane',
      status: 'PENDING_ADMIN_REVIEW',
    } as never);

    const res = await asArtisan(
      request(t.app.getHttpServer()).get(`/api/artisans/hire-requests/${hireRequest.id}/estimates`),
    );
    expect(res.status).toBe(403);
  });

  it('still allows the owning customer to read estimate history while PENDING_ADMIN_REVIEW', async () => {
    await asArtisan(
      request(t.app.getHttpServer())
        .post('/api/artisans/me/profile')
        .send({ tradeType: 'MASON', servicePincode: '560001' }),
    );
    const artisan = await Artisan.findOne({ where: { userId: t.artisanUserId } });
    const hireRequest = await ArtisanHireRequest.create({
      customerId: t.customerUserId,
      artisanId: artisan!.id,
      addressText: '1 Park Lane',
      status: 'PENDING_ADMIN_REVIEW',
    } as never);

    const res = await asCustomer(
      request(t.app.getHttpServer()).get(`/api/artisans/hire-requests/${hireRequest.id}/estimates`),
    );
    expect(res.status).toBe(200);
  });

  it('owning customer can fetch a single hire request by id', async () => {
    await asArtisan(
      request(t.app.getHttpServer())
        .post('/api/artisans/me/profile')
        .send({ tradeType: 'MASON', servicePincode: '560001' }),
    );
    const artisan = await Artisan.findOne({ where: { userId: t.artisanUserId } });
    const hireRequest = await ArtisanHireRequest.create({
      customerId: t.customerUserId,
      artisanId: artisan!.id,
      addressText: '1 Park Lane',
      notes: 'Leaking pipe',
      status: 'ACCEPTED_BY_ARTISAN',
    } as never);

    const res = await asCustomer(
      request(t.app.getHttpServer()).get(`/api/artisans/hire-requests/${hireRequest.id}`),
    );
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(hireRequest.id);
    expect(res.body.data.addressText).toBe('1 Park Lane');
    expect(res.body.data.notes).toBe('Leaking pipe');
  });

  it('owning artisan can fetch a single hire request by id once admin-approved', async () => {
    await asArtisan(
      request(t.app.getHttpServer())
        .post('/api/artisans/me/profile')
        .send({ tradeType: 'MASON', servicePincode: '560001' }),
    );
    const artisan = await Artisan.findOne({ where: { userId: t.artisanUserId } });
    const hireRequest = await ArtisanHireRequest.create({
      customerId: t.customerUserId,
      artisanId: artisan!.id,
      addressText: '1 Park Lane',
      status: 'IN_PROGRESS',
      adminReviewedAt: new Date(),
    } as never);

    const res = await asArtisan(
      request(t.app.getHttpServer()).get(`/api/artisans/hire-requests/${hireRequest.id}`),
    );
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('IN_PROGRESS');
  });

  it('answers 403 when the artisan tries to fetch a hire request still PENDING_ADMIN_REVIEW', async () => {
    await asArtisan(
      request(t.app.getHttpServer())
        .post('/api/artisans/me/profile')
        .send({ tradeType: 'MASON', servicePincode: '560001' }),
    );
    const artisan = await Artisan.findOne({ where: { userId: t.artisanUserId } });
    const hireRequest = await ArtisanHireRequest.create({
      customerId: t.customerUserId,
      artisanId: artisan!.id,
      addressText: '1 Park Lane',
      status: 'PENDING_ADMIN_REVIEW',
    } as never);

    const res = await asArtisan(
      request(t.app.getHttpServer()).get(`/api/artisans/hire-requests/${hireRequest.id}`),
    );
    expect(res.status).toBe(403);
  });

  it('answers 403 when a stranger tries to fetch someone else hire request by id', async () => {
    await asArtisan(
      request(t.app.getHttpServer())
        .post('/api/artisans/me/profile')
        .send({ tradeType: 'MASON', servicePincode: '560001' }),
    );
    const artisan = await Artisan.findOne({ where: { userId: t.artisanUserId } });
    const hireRequest = await ArtisanHireRequest.create({
      customerId: t.customerUserId,
      artisanId: artisan!.id,
      addressText: '1 Park Lane',
      status: 'ACCEPTED_BY_ARTISAN',
    } as never);
    const { token: otherArtisanToken } = await t.newArtisanUser();

    const res = await request(t.app.getHttpServer())
      .get(`/api/artisans/hire-requests/${hireRequest.id}`)
      .set('Authorization', `Bearer ${otherArtisanToken}`);
    expect(res.status).toBe(403);
  });

  it('answers 404 for a hire request id that does not exist', async () => {
    const res = await asCustomer(
      request(t.app.getHttpServer()).get(
        '/api/artisans/hire-requests/00000000-0000-4000-8000-000000000000',
      ),
    );
    expect(res.status).toBe(404);
  });

  it('owning customer can list orders attributed to a hire request', async () => {
    await asArtisan(
      request(t.app.getHttpServer())
        .post('/api/artisans/me/profile')
        .send({ tradeType: 'MASON', servicePincode: '560001' }),
    );
    const artisan = await Artisan.findOne({ where: { userId: t.artisanUserId } });
    const hireRequest = await ArtisanHireRequest.create({
      customerId: t.customerUserId,
      artisanId: artisan!.id,
      addressText: '1 Park Lane',
      status: 'ACCEPTED_BY_ARTISAN',
    } as never);
    t.orderModel.findAll.mockResolvedValueOnce([
      {
        id: 'order-1',
        customerId: 'customer-1',
        deliveryAddressId: 'addr-1',
        grandTotal: 500,
        status: 'confirmed',
        razorpayOrderId: null,
        razorpayPaymentId: null,
        bookingId: hireRequest.id,
        createdAt: new Date(),
        updatedAt: new Date(),
        deliveryAddress: null,
        vendorGroups: [],
      },
    ]);

    const res = await asCustomer(
      request(t.app.getHttpServer()).get(`/api/artisans/hire-requests/${hireRequest.id}/orders`),
    );
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].bookingId).toBe(hireRequest.id);
  });

  it('answers 403 when a stranger tries to list orders attributed to someone else hire request', async () => {
    await asArtisan(
      request(t.app.getHttpServer())
        .post('/api/artisans/me/profile')
        .send({ tradeType: 'MASON', servicePincode: '560001' }),
    );
    const artisan = await Artisan.findOne({ where: { userId: t.artisanUserId } });
    const hireRequest = await ArtisanHireRequest.create({
      customerId: t.customerUserId,
      artisanId: artisan!.id,
      addressText: '1 Park Lane',
      status: 'ACCEPTED_BY_ARTISAN',
    } as never);
    const { token: otherArtisanToken } = await t.newArtisanUser();

    const res = await request(t.app.getHttpServer())
      .get(`/api/artisans/hire-requests/${hireRequest.id}/orders`)
      .set('Authorization', `Bearer ${otherArtisanToken}`);
    expect(res.status).toBe(403);
  });

  it('answers 403 when an artisan tries to add an estimate while PENDING_ADMIN_REVIEW', async () => {
    await asArtisan(
      request(t.app.getHttpServer())
        .post('/api/artisans/me/profile')
        .send({ tradeType: 'PAINTER', servicePincode: '560001' }),
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
        .post(`/api/artisans/me/hire-requests/${hireRequest.id}/estimates`)
        .send({ estimatedDays: 2 }),
    );
    expect(res.status).toBe(403);
  });

  it('artisan can start and complete work on their own accepted hire request', async () => {
    await asArtisan(
      request(t.app.getHttpServer())
        .post('/api/artisans/me/profile')
        .send({ tradeType: 'MASON', servicePincode: '560001' }),
    );
    const artisan = await Artisan.findOne({ where: { userId: t.artisanUserId } });
    const hireRequest = await ArtisanHireRequest.create({
      customerId: t.customerUserId,
      artisanId: artisan!.id,
      addressText: '1 Park Lane',
      status: 'ACCEPTED_BY_ARTISAN',
    } as never);

    const start = await asArtisan(
      request(t.app.getHttpServer()).patch(
        `/api/artisans/me/hire-requests/${hireRequest.id}/start`,
      ),
    );
    expect(start.status).toBe(200);
    expect(start.body.data.status).toBe('IN_PROGRESS');
    expect(start.body.data.startedAt).not.toBeNull();

    const complete = await asArtisan(
      request(t.app.getHttpServer()).patch(
        `/api/artisans/me/hire-requests/${hireRequest.id}/complete`,
      ),
    );
    expect(complete.status).toBe(200);
    expect(complete.body.data.status).toBe('COMPLETED');
    expect(complete.body.data.completedAt).not.toBeNull();
  });

  it('answers 409 when starting a hire request that is not yet accepted', async () => {
    await asArtisan(
      request(t.app.getHttpServer())
        .post('/api/artisans/me/profile')
        .send({ tradeType: 'MASON', servicePincode: '560001' }),
    );
    const artisan = await Artisan.findOne({ where: { userId: t.artisanUserId } });
    const hireRequest = await ArtisanHireRequest.create({
      customerId: t.customerUserId,
      artisanId: artisan!.id,
      addressText: '1 Park Lane',
      status: 'PENDING_ADMIN_REVIEW',
    } as never);

    const res = await asArtisan(
      request(t.app.getHttpServer()).patch(
        `/api/artisans/me/hire-requests/${hireRequest.id}/start`,
      ),
    );
    expect(res.status).toBe(409);
  });

  it('customer can cancel their own hire request with a reason', async () => {
    await asArtisan(
      request(t.app.getHttpServer())
        .post('/api/artisans/me/profile')
        .send({ tradeType: 'MASON', servicePincode: '560001' }),
    );
    const artisan = await Artisan.findOne({ where: { userId: t.artisanUserId } });
    const hireRequest = await ArtisanHireRequest.create({
      customerId: t.customerUserId,
      artisanId: artisan!.id,
      addressText: '1 Park Lane',
      status: 'ACCEPTED_BY_ARTISAN',
    } as never);

    const res = await asCustomer(
      request(t.app.getHttpServer())
        .patch(`/api/artisans/hire-requests/${hireRequest.id}/cancel`)
        .send({ reason: 'No longer needed' }),
    );
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CANCELLED');
    expect(res.body.data.cancelReason).toBe('No longer needed');
  });

  it('answers 400 when cancelling without a reason', async () => {
    await asArtisan(
      request(t.app.getHttpServer())
        .post('/api/artisans/me/profile')
        .send({ tradeType: 'MASON', servicePincode: '560001' }),
    );
    const artisan = await Artisan.findOne({ where: { userId: t.artisanUserId } });
    const hireRequest = await ArtisanHireRequest.create({
      customerId: t.customerUserId,
      artisanId: artisan!.id,
      addressText: '1 Park Lane',
      status: 'ACCEPTED_BY_ARTISAN',
    } as never);

    const res = await asCustomer(
      request(t.app.getHttpServer())
        .patch(`/api/artisans/hire-requests/${hireRequest.id}/cancel`)
        .send({}),
    );
    expect(res.status).toBe(400);
  });

  it('answers 403 when a stranger customer tries to cancel someone else hire request', async () => {
    const { token: otherArtisanToken } = await t.newArtisanUser();
    await request(t.app.getHttpServer())
      .post('/api/artisans/me/profile')
      .set('Authorization', `Bearer ${otherArtisanToken}`)
      .send({ tradeType: 'MASON', servicePincode: '560001' });

    await asArtisan(
      request(t.app.getHttpServer())
        .post('/api/artisans/me/profile')
        .send({ tradeType: 'MASON', servicePincode: '560001' }),
    );
    const artisan = await Artisan.findOne({ where: { userId: t.artisanUserId } });
    const hireRequest = await ArtisanHireRequest.create({
      customerId: t.customerUserId,
      artisanId: artisan!.id,
      addressText: '1 Park Lane',
      status: 'ACCEPTED_BY_ARTISAN',
    } as never);

    const res = await request(t.app.getHttpServer())
      .patch(`/api/artisans/hire-requests/${hireRequest.id}/cancel`)
      .set('Authorization', `Bearer ${otherArtisanToken}`)
      .send({ reason: 'not mine' });
    expect(res.status).toBe(403);
  });

  it('rejects a team member documentUrl outside the artisan own prefix', async () => {
    await asArtisan(
      request(t.app.getHttpServer())
        .post('/api/artisans/me/profile')
        .send({ tradeType: 'OTHERS', servicePincode: '560001' }),
    );

    const res = await asArtisan(
      request(t.app.getHttpServer())
        .post('/api/artisans/me/team')
        .send({ name: 'Ramesh', documentUrl: 'artisans/someone-else/doc.pdf' }),
    );
    expect(res.status).toBe(400);
  });

  it('accepts a team member documentUrl under the artisan own prefix', async () => {
    const created = await asArtisan(
      request(t.app.getHttpServer())
        .post('/api/artisans/me/profile')
        .send({ tradeType: 'OTHERS', servicePincode: '560001' }),
    );
    const id = created.body.data.id;

    const res = await asArtisan(
      request(t.app.getHttpServer())
        .post('/api/artisans/me/team')
        .send({ name: 'Ramesh', documentUrl: `artisans/${id}/team/doc.pdf` }),
    );
    expect(res.status).toBe(201);
  });

  describe('ustaad accept/decline (0055)', () => {
    async function waitingRequest(status = 'PENDING_ARTISAN_RESPONSE') {
      await asArtisan(
        request(t.app.getHttpServer())
          .post('/api/artisans/me/profile')
          .send({ tradeType: 'MASON', servicePincode: '560001' }),
      );
      const artisan = await Artisan.findOne({ where: { userId: t.artisanUserId } });
      return ArtisanHireRequest.create({
        customerId: t.customerUserId,
        artisanId: artisan!.id,
        addressText: '1 Park Lane',
        status,
        adminReviewedAt: new Date(),
      } as never);
    }

    it('the ustaad sees the customer contact on a request waiting for them, and can accept it', async () => {
      const hireRequest = await waitingRequest();

      const read = await asArtisan(
        request(t.app.getHttpServer()).get(`/api/artisans/hire-requests/${hireRequest.id}`),
      );
      expect(read.status).toBe(200);
      expect(read.body.data.customerPhone).toEqual(expect.any(String));
      expect(read.body.data.artisanResponseDueAt).toEqual(expect.any(String));

      const accept = await asArtisan(
        request(t.app.getHttpServer()).patch(
          `/api/artisans/me/hire-requests/${hireRequest.id}/accept`,
        ),
      );
      expect(accept.status).toBe(200);
      expect(accept.body.data.status).toBe('ACCEPTED_BY_ARTISAN');
    });

    it('decline needs a reason (400) and records it (200)', async () => {
      const hireRequest = await waitingRequest();
      const url = `/api/artisans/me/hire-requests/${hireRequest.id}/decline`;

      const missing = await asArtisan(request(t.app.getHttpServer()).patch(url).send({}));
      expect(missing.status).toBe(400);

      const ok = await asArtisan(
        request(t.app.getHttpServer()).patch(url).send({ reason: 'Fully booked' }),
      );
      expect(ok.status).toBe(200);
      expect(ok.body.data.status).toBe('ARTISAN_DECLINED');
      expect(ok.body.data.artisanDeclineReason).toBe('Fully booked');
      expect(ok.body.data.customerPhone).toBeNull();
    });

    it('a customer cannot accept on the ustaad behalf (403)', async () => {
      const hireRequest = await waitingRequest();
      const res = await asCustomer(
        request(t.app.getHttpServer()).patch(
          `/api/artisans/me/hire-requests/${hireRequest.id}/accept`,
        ),
      );
      expect(res.status).toBe(403);
    });

    it('the ustaad cannot read a request the admin blocked (403)', async () => {
      const hireRequest = await waitingRequest('ADMIN_REJECTED');
      const res = await asArtisan(
        request(t.app.getHttpServer()).get(`/api/artisans/hire-requests/${hireRequest.id}`),
      );
      expect(res.status).toBe(403);
    });

    it('the ustaad cannot read a request cancelled before the admin reviewed it (403)', async () => {
      const hireRequest = await waitingRequest('CANCELLED');
      await hireRequest.update({ adminReviewedAt: null } as never);
      const res = await asArtisan(
        request(t.app.getHttpServer()).get(`/api/artisans/hire-requests/${hireRequest.id}`),
      );
      expect(res.status).toBe(403);
    });

    it('a customer gets 409 for a second open request to the same ustaad', async () => {
      const first = await waitingRequest();
      await Artisan.update({ isAvailable: true }, { where: { id: first.artisanId } });
      await Artisan.update({ isVerified: true }, { where: { id: first.artisanId } });

      const res = await asCustomer(
        request(t.app.getHttpServer())
          .post('/api/artisans/hire-requests')
          .send({ artisanId: first.artisanId, addressText: '2 Park Lane' }),
      );
      expect(res.status).toBe(409);
    });
  });
});
