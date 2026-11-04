import request from 'supertest';
import { Op } from 'sequelize';

import {
  createVendorOnboardingTestApp,
  VendorOnboardingTestApp,
} from './vendor-onboarding-test-app';
import { Vendor } from '../models/vendor.model';
import { VendorAccountDetails } from '../models/vendor-account-details.model';
import { City } from '../../catalog/models/city.model';

jest.setTimeout(60_000);

// resolveNearestCity has no distance cutoff — it matches the nearest
// ACTIVE city in the whole table, however far, so a "no city resolves"
// assertion is only reliable if every OTHER active city (including ones
// left behind by unrelated suites sharing this test database) is
// deactivated for the duration of the call. Returns a restore function.
async function withNoOtherActiveCities(excludeIds: string[]): Promise<() => Promise<void>> {
  const others = await City.findAll({ where: { isActive: true, id: { [Op.notIn]: excludeIds } } });
  const otherIds = others.map((city) => city.id);
  if (otherIds.length > 0) {
    await City.update({ isActive: false }, { where: { id: otherIds } });
  }
  return async () => {
    if (otherIds.length > 0) {
      await City.update({ isActive: true }, { where: { id: otherIds } });
    }
  };
}

describe('Vendor onboarding and city resolution (real HTTP, Postgres)', () => {
  let t: VendorOnboardingTestApp;

  const onboardBody = (overrides: Record<string, unknown> = {}) => ({
    shopName: 'Test Hardware',
    address: '1 Test Street',
    latitude: 28.7041,
    longitude: 77.1025,
    accountDetails: {
      accountHolderName: 'Test Vendor',
      bankName: 'Test Bank',
      ifscCode: 'TEST0000001',
      branchName: 'Test Branch',
      accountNumber: '1234567890',
    },
    ...overrides,
  });

  beforeAll(async () => {
    t = await createVendorOnboardingTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  describe('approval gate (0057)', () => {
    it('a pending vendor can onboard and read their profile but not their orders', async () => {
      const vendor = await t.newVendorUser();
      const as = (req: request.Test) => req.set('Authorization', `Bearer ${vendor.token}`);
      const server = t.app.getHttpServer();

      expect(
        (await as(request(server).post('/api/vendors/onboard').send(onboardBody()))).status,
      ).toBe(201);
      expect((await as(request(server).get('/api/vendors/me'))).status).toBe(200);
      const orders = await as(request(server).get('/api/vendors/order-groups'));

      expect(orders.status).toBe(403);
      expect(orders.body.code).toBe('ACCOUNT_NOT_APPROVED');
    });
  });

  it('onboards, resolves the nearest active city, and sets citySource to gps', async () => {
    const vendor = await t.newVendorUser();
    const city = await t.createCity({ centroidLat: 28.7041, centroidLng: 77.1025 });

    const res = await request(t.app.getHttpServer())
      .post('/api/vendors/onboard')
      .set('Authorization', `Bearer ${vendor.token}`)
      .send(onboardBody());

    expect(res.status).toBe(201);
    expect(res.body.data.cityId).toBe(city.id);

    const row = await Vendor.findOne({ where: { userId: vendor.userId } });
    expect(row!.citySource).toBe('gps');
  });

  it('creates both the vendor row and its account-details row in one unit of work', async () => {
    const vendor = await t.newVendorUser();
    await t.createCity();

    const res = await request(t.app.getHttpServer())
      .post('/api/vendors/onboard')
      .set('Authorization', `Bearer ${vendor.token}`)
      .send(onboardBody());

    expect(res.status).toBe(201);
    const row = await Vendor.findOne({ where: { userId: vendor.userId } });
    const accountDetails = await VendorAccountDetails.findOne({ where: { vendorId: row!.id } });
    expect(accountDetails).not.toBeNull();
    expect(accountDetails!.ifscCode).toBe('TEST0000001');
  });

  it('rejects a second onboarding for the same user with 409', async () => {
    const vendor = await t.newVendorUser();
    await t.createCity();

    await request(t.app.getHttpServer())
      .post('/api/vendors/onboard')
      .set('Authorization', `Bearer ${vendor.token}`)
      .send(onboardBody());

    const res = await request(t.app.getHttpServer())
      .post('/api/vendors/onboard')
      .set('Authorization', `Bearer ${vendor.token}`)
      .send(onboardBody());

    expect(res.status).toBe(409);
  });

  it('onboards successfully with a null city when no active city is in range — does not block onboarding', async () => {
    const vendor = await t.newVendorUser();
    const restore = await withNoOtherActiveCities([]);

    try {
      const res = await request(t.app.getHttpServer())
        .post('/api/vendors/onboard')
        .set('Authorization', `Bearer ${vendor.token}`)
        .send(onboardBody({ latitude: 1.23, longitude: 4.56 }));

      expect(res.status).toBe(201);
      expect(res.body.data.cityId).toBeNull();

      const row = await Vendor.findOne({ where: { userId: vendor.userId } });
      expect(row!.citySource).toBeNull();
    } finally {
      await restore();
    }
  });

  it('onboards successfully with a null city when the only matching city is inactive', async () => {
    const vendor = await t.newVendorUser();
    const inactiveCity = await t.createCity({
      centroidLat: 19.076,
      centroidLng: 72.8777,
      isActive: false,
    });
    const restore = await withNoOtherActiveCities([inactiveCity.id]);

    try {
      const res = await request(t.app.getHttpServer())
        .post('/api/vendors/onboard')
        .set('Authorization', `Bearer ${vendor.token}`)
        .send(onboardBody({ latitude: 19.076, longitude: 72.8777 }));

      expect(res.status).toBe(201);
      expect(res.body.data.cityId).toBeNull();
    } finally {
      await restore();
    }
  });

  it('re-resolves the city on a coordinate change when citySource is gps', async () => {
    const vendor = await t.newVendorUser();
    const delhi = await t.createCity({
      name: 'Delhi Fixture',
      centroidLat: 28.7041,
      centroidLng: 77.1025,
    });
    const mumbai = await t.createCity({
      name: 'Mumbai Fixture',
      centroidLat: 19.076,
      centroidLng: 72.8777,
    });

    await request(t.app.getHttpServer())
      .post('/api/vendors/onboard')
      .set('Authorization', `Bearer ${vendor.token}`)
      .send(onboardBody({ latitude: 28.7041, longitude: 77.1025 }));

    const res = await request(t.app.getHttpServer())
      .patch('/api/vendors/me')
      .set('Authorization', `Bearer ${vendor.token}`)
      .send({ latitude: 19.076, longitude: 72.8777 });

    expect(res.status).toBe(200);
    expect(res.body.data.cityId).toBe(mumbai.id);
    expect(res.body.data.cityId).not.toBe(delhi.id);
  });

  it('keeps an admin-pinned city on a coordinate change — does not silently re-resolve', async () => {
    const vendor = await t.newVendorUser();
    const delhi = await t.createCity({
      name: 'Delhi Fixture 2',
      centroidLat: 28.7041,
      centroidLng: 77.1025,
    });
    const mumbai = await t.createCity({
      name: 'Mumbai Fixture 2',
      centroidLat: 19.076,
      centroidLng: 72.8777,
    });
    const restore = await withNoOtherActiveCities([delhi.id, mumbai.id]);

    try {
      await request(t.app.getHttpServer())
        .post('/api/vendors/onboard')
        .set('Authorization', `Bearer ${vendor.token}`)
        .send(onboardBody({ latitude: 28.7041, longitude: 77.1025 }));

      // Simulate an admin pin directly on the row (admin city-override is
      // tested in admin-vendors.controller.spec.ts; here we only need the
      // resulting state to assert the self-service update respects it).
      const row = await Vendor.findOne({ where: { userId: vendor.userId } });
      await row!.update({ citySource: 'admin' });

      const res = await request(t.app.getHttpServer())
        .patch('/api/vendors/me')
        .set('Authorization', `Bearer ${vendor.token}`)
        .send({ latitude: 19.076, longitude: 72.8777 });

      expect(res.status).toBe(200);
      expect(res.body.data.cityId).toBe(delhi.id);
    } finally {
      await restore();
    }
  });

  it('keeps the existing city when a coordinate change resolves to nothing', async () => {
    const vendor = await t.newVendorUser();
    const delhi = await t.createCity({
      name: 'Delhi Fixture 3',
      centroidLat: 28.7041,
      centroidLng: 77.1025,
    });
    const restore = await withNoOtherActiveCities([delhi.id]);

    try {
      await request(t.app.getHttpServer())
        .post('/api/vendors/onboard')
        .set('Authorization', `Bearer ${vendor.token}`)
        .send(onboardBody({ latitude: 28.7041, longitude: 77.1025 }));

      const res = await request(t.app.getHttpServer())
        .patch('/api/vendors/me')
        .set('Authorization', `Bearer ${vendor.token}`)
        .send({ latitude: 1.23, longitude: 4.56 });

      expect(res.status).toBe(200);
      expect(res.body.data.cityId).toBe(delhi.id);
    } finally {
      await restore();
    }
  });
});
