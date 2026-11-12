import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { SequelizeModule } from '@nestjs/sequelize';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Role } from '@golden-abode/types';
import { GlobalExceptionFilter } from '../../../common/filters/global-exception.filter';
import { ResponseInterceptor } from '../../../common/interceptors/response.interceptor';
import { JwtStrategy } from '../../auth/strategies/jwt.strategy';
import { UsersService } from '../../users/users.service';
import { Vendor } from '../../vendors/models/vendor.model';
import { VendorsController } from '../../vendors/vendors.controller';
import { VendorsService } from '../../vendors/vendors.service';
import { VendorCategoriesService } from '../../catalog/vendor-categories.service';
import { CustomersService } from '../../customers/customers.service';
import { CartService } from '../../cart/cart.service';
import { CheckoutService } from '../../orders/checkout.service';
import { OrdersService } from '../../orders/orders.service';
import { OrderPaymentService } from '../../orders/order-payment.service';
import { OrdersController } from '../../orders/orders.controller';
import { LOCKED_PARENT_ORDER_STATUSES } from '../../orders/refund-status';
import { PAYMENTS_TEST_MODELS } from '../../orders/__tests__/test-db';
import { JWT_SECRET } from '../../orders/__tests__/payments-test-app';
import { PAYMENT_PROVIDER } from '../../payments/payment-provider.interface';
import { FakePaymentProvider } from '../../payments/__tests__/fake-payment-provider';
import { OBJECT_STORAGE } from '../../catalog/media/object-storage';
import { NOTIFICATION_SERVICE } from '../../notifications/notification.interface';
import { AdminDeliveryController } from '../admin-delivery.controller';
import { DriverController } from '../driver.controller';
import { DeliveryAssignmentsService } from '../delivery-assignments.service';
import { DeliveryPhotoService } from '../delivery-photo.service';
import { DriverDeliveriesService } from '../driver-deliveries.service';
import { DriversService } from '../drivers.service';
import { VendorHandoverService } from '../vendor-handover.service';
import { DriverFixture, setupDriverFixture } from './driver-fixture';

jest.setTimeout(60_000);

// Decision 0060, S9: the whole delivery flow through real HTTP, real guards and
// real tokens, one actor at a time. Only the outbound edges are faked
// (notifications, object storage, payment provider).
describe('Delivery flow end to end (decision 0060)', () => {
  let f: DriverFixture;
  let app: INestApplication;
  let driverToken: string;
  let driverUserId: string;
  let driverId: string;

  beforeAll(async () => {
    f = await setupDriverFixture();

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ jwt: { accessSecret: JWT_SECRET } })],
        }),
        SequelizeModule.forRoot({
          dialect: 'postgres',
          host: process.env.TEST_DB_HOST ?? '127.0.0.1',
          port: Number(process.env.TEST_DB_PORT ?? 5432),
          username: process.env.TEST_DB_USER ?? 'postgres',
          password: process.env.TEST_DB_PASS ?? 'postgres',
          database: process.env.TEST_DB_NAME ?? 'golden_abode_test',
          logging: false,
          models: PAYMENTS_TEST_MODELS,
        }),
        SequelizeModule.forFeature(PAYMENTS_TEST_MODELS),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: JWT_SECRET, signOptions: { expiresIn: '15m' } }),
      ],
      controllers: [OrdersController, VendorsController, AdminDeliveryController, DriverController],
      providers: [
        UsersService,
        JwtStrategy,
        CustomersService,
        CartService,
        CheckoutService,
        OrdersService,
        OrderPaymentService,
        DeliveryAssignmentsService,
        DriversService,
        DeliveryPhotoService,
        DriverDeliveriesService,
        VendorHandoverService,
        // The vendor routes under test only need to find the caller's vendor row.
        {
          provide: VendorsService,
          useValue: {
            resolveVendorByUserId: (userId: string) => Vendor.findOne({ where: { userId } }),
          },
        },
        { provide: VendorCategoriesService, useValue: {} },
        { provide: PAYMENT_PROVIDER, useValue: new FakePaymentProvider() },
        { provide: NOTIFICATION_SERVICE, useValue: f.notifications },
        // Same fake storage the fixture seeds photos into.
        { provide: OBJECT_STORAGE, useValue: f.storage },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();

    const driver = await f.makeDriver('Test Driver Flow');
    driverId = driver.id;
    driverUserId = driver.userId;
    driverToken = moduleRef.get(JwtService).sign({ sub: driverUserId, role: Role.DRIVER });
  });

  afterAll(async () => {
    // The fixture closes first: the models stay bound to its connection.
    await f.close();
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const as = (token: string) => ({
    get: (p: string) => http().get(`/api${p}`).set('Authorization', `Bearer ${token}`),
    post: (p: string, body: object = {}) =>
      http().post(`/api${p}`).set('Authorization', `Bearer ${token}`).send(body),
    patch: (p: string, body: object = {}) =>
      http().patch(`/api${p}`).set('Authorization', `Bearer ${token}`).send(body),
  });
  const admin = () => as(f.t.adminToken);
  const vendor = () => as(f.t.vendorToken);
  const customer = () => as(f.t.customerToken);
  const driver = () => as(driverToken);

  const customerGroup = async (orderId: string, groupId: string) => {
    const res = await customer().get(`/orders/${orderId}`);
    expect(res.status).toBe(200);
    return (
      res.body.data.vendorGroups as { id: string; status: string; deliveryOtp: string | null }[]
    ).find((g) => g.id === groupId)!;
  };

  const otpOf = async (assignmentId: string) => (await f.row(assignmentId)).delivery_otp as string;

  // Confirmed group -> vendor marks it packed -> admin assigns -> driver sees it.
  async function packedAndAssigned() {
    const g = await f.seedGroup({ groupStatus: 'confirmed' });
    const packed = await vendor().patch(`/vendors/order-groups/${g.groupId}/status`, {
      status: 'ready_for_pickup',
    });
    expect(packed.status).toBe(200);

    const assigned = await admin().post('/admin/delivery/assignments', {
      orderVendorGroupId: g.groupId,
      driverId,
    });
    expect(assigned.status).toBe(201);
    const assignmentId = assigned.body.data.id as string;

    const jobs = await driver().get('/driver/deliveries');
    expect(jobs.status).toBe(200);
    expect((jobs.body.data as { id: string }[]).map((j) => j.id)).toContain(assignmentId);
    return { ...g, assignmentId };
  }

  const pickup = (assignmentId: string, itemId: string) =>
    driver().post(`/driver/deliveries/${assignmentId}/pickup`, {
      items: [{ orderItemId: itemId, loaded: true }],
    });

  it('happy path: packed, assigned, handed over, picked up, delivered with the OTP', async () => {
    const g = await packedAndAssigned();

    const handedOver = await vendor().post(`/vendors/order-groups/${g.groupId}/handover`, {});
    expect(handedOver.status).toBe(200);
    expect(handedOver.body.data.vendorHandedOverAt).toEqual(expect.any(String));

    // Before pickup the customer has no code to read out.
    expect(await customerGroup(g.orderId, g.groupId)).toMatchObject({
      status: 'ready_for_pickup',
      deliveryOtp: null,
    });

    const picked = await pickup(g.assignmentId, g.itemId);
    expect(picked.status).toBe(201);
    const otp = await otpOf(g.assignmentId);
    expect(otp).toMatch(/^\d{6}$/);

    expect(await customerGroup(g.orderId, g.groupId)).toMatchObject({
      status: 'shipped',
      deliveryOtp: otp,
    });

    const photoKey = `delivery/${g.groupId}/delivered-${g.assignmentId}.jpg`;
    f.storage.seed(photoKey);
    const done = await driver().post(`/driver/deliveries/${g.assignmentId}/complete`, {
      otp,
      photoKey,
    });
    expect(done.status).toBe(201);
    expect(done.body.data).toMatchObject({ id: g.assignmentId, status: 'delivered' });

    // Delivered: the code is gone from the customer's view.
    expect(await customerGroup(g.orderId, g.groupId)).toMatchObject({
      status: 'delivered',
      deliveryOtp: null,
    });
    expect(await f.groupStatus(g.groupId)).toBe('delivered');
  });

  it('failed delivery: fail, admin re-attempt (back on the road), then deliver', async () => {
    const g = await packedAndAssigned();
    expect((await pickup(g.assignmentId, g.itemId)).status).toBe(201);

    const failKey = `delivery/${g.groupId}/failed-${g.assignmentId}.jpg`;
    f.storage.seed(failKey);
    const failed = await driver().post(`/driver/deliveries/${g.assignmentId}/fail`, {
      reason: 'customer_unavailable',
      photoKey: failKey,
    });
    expect(failed.status).toBe(201);
    expect(failed.body.data).toMatchObject({ status: 'failed' });
    expect(await f.groupStatus(g.groupId)).toBe('delivery_failed');
    expect((await customerGroup(g.orderId, g.groupId)).deliveryOtp).toBeNull();

    const again = await admin().post(`/admin/delivery/groups/${g.groupId}/reattempt`, { driverId });
    expect(again.status).toBe(201);
    const secondId = again.body.data.id as string;
    expect(secondId).not.toBe(g.assignmentId);

    // A re-attempt starts already picked up: the goods never left the truck.
    expect(await f.groupStatus(g.groupId)).toBe('shipped');
    const otp = await otpOf(secondId);
    expect((await customerGroup(g.orderId, g.groupId)).deliveryOtp).toBe(otp);

    const photoKey = `delivery/${g.groupId}/delivered-${secondId}.jpg`;
    f.storage.seed(photoKey);
    const done = await driver().post(`/driver/deliveries/${secondId}/complete`, { otp, photoKey });
    expect(done.status).toBe(201);
    expect(await f.groupStatus(g.groupId)).toBe('delivered');

    // Both attempts stay on the record for ops.
    const attempts = await admin().get(`/admin/delivery/assignments?orderId=${g.orderId}`);
    expect(attempts.status).toBe(200);
    expect(
      (attempts.body.data.items as { attemptNo: number; status: string }[])
        .map((a) => [a.attemptNo, a.status])
        .sort(),
    ).toEqual([
      [1, 'failed'],
      [2, 'delivered'],
    ]);
  });

  it('a refund mid-way blocks the job: the driver cannot pick up and the job reads blocked', async () => {
    const g = await packedAndAssigned();
    await f.t.query(`UPDATE orders SET status = :s WHERE id = :id`, {
      s: LOCKED_PARENT_ORDER_STATUSES[0],
      id: g.orderId,
    });

    const refused = await pickup(g.assignmentId, g.itemId);
    expect(refused.status).toBe(400);

    const job = await driver().get(`/driver/deliveries/${g.assignmentId}`);
    expect(job.status).toBe(200);
    expect(job.body.data).toMatchObject({ blocked: true });
    expect(await f.groupStatus(g.groupId)).toBe('ready_for_pickup');
  });

  it('another vendor-less caller is turned away at the HTTP edge', async () => {
    const g = await packedAndAssigned();
    // The customer token cannot use the vendor handover route.
    const res = await customer().post(`/vendors/order-groups/${g.groupId}/handover`, {});
    expect(res.status).toBe(403);
    // And the driver cannot assign work.
    const res2 = await driver().post('/admin/delivery/assignments', {
      orderVendorGroupId: g.groupId,
      driverId,
    });
    expect(res2.status).toBe(403);
  });
});
