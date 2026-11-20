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
import { User } from '../../users/models/user.model';
import { UsersService } from '../../users/users.service';
import { PAYMENTS_TEST_MODELS } from '../../orders/__tests__/test-db';
import { FakeObjectStorage } from '../../artisans/__tests__/fake-object-storage';
import { OBJECT_STORAGE } from '../../catalog/media/object-storage';
import { LogNotificationService } from '../../notifications/log-notification.service';
import { NOTIFICATION_SERVICE } from '../../notifications/notification.interface';
import { Vehicle } from '../models/vehicle.model';
import { Driver } from '../models/driver.model';
import { DeliveryAssignment } from '../models/delivery-assignment.model';
import { DriverController } from '../driver.controller';
import { DriverDeliveriesService } from '../driver-deliveries.service';
import { DeliveryPhotoService } from '../delivery-photo.service';
import { DriversService } from '../drivers.service';

jest.setTimeout(60_000);

const SECRET = 'driver-controller-test-jwt-secret-1234567890';
const ANY_ID = '00000000-0000-4000-8000-000000000000';

describe('DriverController (decision 0060, contract section 1)', () => {
  let app: INestApplication;
  const tokens: Record<string, string> = {};
  const createdUserIds: string[] = [];
  let driverId: string;
  const suffix = Math.random().toString(36).slice(2, 8);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ jwt: { accessSecret: SECRET } })],
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
        SequelizeModule.forFeature([User, Vehicle, Driver, DeliveryAssignment]),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: SECRET, signOptions: { expiresIn: '15m' } }),
      ],
      controllers: [DriverController],
      providers: [
        UsersService,
        JwtStrategy,
        DriversService,
        DriverDeliveriesService,
        DeliveryPhotoService,
        { provide: NOTIFICATION_SERVICE, useClass: LogNotificationService },
        { provide: OBJECT_STORAGE, useValue: new FakeObjectStorage() },
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

    const jwt = moduleRef.get(JwtService);
    for (const [name, role] of [
      ['customer', Role.CUSTOMER],
      ['vendor', Role.VENDOR],
      ['admin', Role.ADMIN],
    ] as const) {
      const u = await User.create({
        name: `Driver Ctl ${name} ${suffix}`,
        phone:
          `${name === 'admin' ? 7 : name === 'vendor' ? 9 : 8}${suffix}${Math.floor(Math.random() * 90 + 10)}`.slice(
            0,
            10,
          ),
        role,
        isActive: true,
        isApproved: true,
      } as never);
      createdUserIds.push(u.id);
      tokens[name] = jwt.sign({ sub: u.id, role });
    }
    const drivers = moduleRef.get(DriversService);
    const driver = await drivers.create({
      name: `Test Driver Ctl ${suffix}`,
      phone: `+9195${String(Math.floor(Math.random() * 90000000) + 10000000)}`,
      licenceNumber: `TEST-CTL-${suffix}`,
    } as never);
    driverId = driver.id;
    createdUserIds.push(driver.userId);
    tokens.driver = jwt.sign({ sub: driver.userId, role: Role.DRIVER });
  });

  afterAll(async () => {
    await Driver.destroy({ where: { id: driverId } });
    await User.destroy({ where: { id: createdUserIds } });
    await app.close();
  });

  const routes: [string, string, object | null][] = [
    ['get', '/api/driver/me', null],
    ['get', '/api/driver/deliveries', null],
    ['get', `/api/driver/deliveries/${ANY_ID}`, null],
    ['post', `/api/driver/deliveries/${ANY_ID}/pickup`, { items: [] }],
    ['post', `/api/driver/deliveries/${ANY_ID}/photo-url`, {}],
    ['post', `/api/driver/deliveries/${ANY_ID}/complete`, {}],
    ['post', `/api/driver/deliveries/${ANY_ID}/fail`, {}],
  ];

  it.each(routes)('%s %s is 401 without a token', async (method, path, body) => {
    const req = (
      request(app.getHttpServer()) as never as Record<string, (p: string) => request.Test>
    )[method](path);
    const res = await (body ? req.send(body) : req);
    expect(res.status).toBe(401);
  });

  it.each(routes)(
    '%s %s is 403 for customer, vendor and admin tokens',
    async (method, path, body) => {
      for (const who of ['customer', 'vendor', 'admin']) {
        const req = (
          request(app.getHttpServer()) as never as Record<string, (p: string) => request.Test>
        )
          [method](path)
          .set('Authorization', `Bearer ${tokens[who]}`);
        const res = await (body ? req.send(body) : req);
        expect([who, res.status]).toEqual([who, 403]);
      }
    },
  );

  const asDriver = (req: request.Test) => req.set('Authorization', `Bearer ${tokens.driver}`);

  it('a driver token reaches GET /driver/me', async () => {
    const res = await asDriver(request(app.getHttpServer()).get('/api/driver/me'));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: driverId, helper: null, vehicle: null });
  });

  it('lists an empty active and history set, and defaults the scope to active', async () => {
    for (const q of ['', '?scope=active', '?scope=history']) {
      const res = await asDriver(request(app.getHttpServer()).get(`/api/driver/deliveries${q}`));
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    }
    const bad = await asDriver(
      request(app.getHttpServer()).get('/api/driver/deliveries?scope=all'),
    );
    expect(bad.status).toBe(400);
  });

  it('404s on a job that does not exist and on a malformed id', async () => {
    const missing = await asDriver(
      request(app.getHttpServer()).get(`/api/driver/deliveries/${ANY_ID}`),
    );
    expect(missing.status).toBe(404);
    const malformed = await asDriver(
      request(app.getHttpServer()).get('/api/driver/deliveries/nope'),
    );
    expect(malformed.status).toBe(400);
  });

  describe('body validation (400 before any lookup)', () => {
    const post = (path: string, body: object) =>
      asDriver(request(app.getHttpServer()).post(`/api/driver/deliveries/${ANY_ID}${path}`)).send(
        body,
      );

    it('pickup needs a non-empty items list of { orderItemId, loaded }', async () => {
      expect((await post('/pickup', { items: [] })).status).toBe(400);
      expect((await post('/pickup', {})).status).toBe(400);
      expect((await post('/pickup', { items: [{ orderItemId: 'x', loaded: true }] })).status).toBe(
        400,
      );
      expect((await post('/pickup', { items: [{ orderItemId: ANY_ID }] })).status).toBe(400);
      // Well-formed: passes validation and reaches the lookup, which 404s.
      expect(
        (await post('/pickup', { items: [{ orderItemId: ANY_ID, loaded: true }] })).status,
      ).toBe(404);
    });

    it('photo-url needs a kind of delivered or failed and a jpeg or png content type', async () => {
      expect(
        (await post('/photo-url', { kind: 'handover', contentType: 'image/jpeg' })).status,
      ).toBe(400);
      expect(
        (await post('/photo-url', { kind: 'failed', contentType: 'application/pdf' })).status,
      ).toBe(400);
      expect((await post('/photo-url', { kind: 'failed', contentType: 'image/png' })).status).toBe(
        404,
      );
    });

    it('complete needs a 6 digit otp and a photoKey', async () => {
      for (const otp of ['12345', '1234567', 'abcdef', '12 456']) {
        expect((await post('/complete', { otp, photoKey: 'k' })).status).toBe(400);
      }
      expect((await post('/complete', { otp: '123456' })).status).toBe(400);
      expect((await post('/complete', { otp: '123456', photoKey: 'k' })).status).toBe(404);
    });

    it('fail needs an allowed reason, a photoKey and a note of at most 500 characters', async () => {
      expect((await post('/fail', { reason: 'bored', photoKey: 'k' })).status).toBe(400);
      expect((await post('/fail', { reason: 'other' })).status).toBe(400);
      expect(
        (await post('/fail', { reason: 'other', photoKey: 'k', note: 'x'.repeat(501) })).status,
      ).toBe(400);
      expect((await post('/fail', { reason: 'other', photoKey: 'k', note: 'ok' })).status).toBe(
        404,
      );
    });
  });
});
