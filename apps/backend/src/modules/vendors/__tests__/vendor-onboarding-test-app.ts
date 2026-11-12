import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { SequelizeModule } from '@nestjs/sequelize';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@golden-abode/types';

import { GlobalExceptionFilter } from '../../../common/filters/global-exception.filter';
import { ResponseInterceptor } from '../../../common/interceptors/response.interceptor';
import { JwtStrategy } from '../../auth/strategies/jwt.strategy';
import { User } from '../../users/models/user.model';
import { UsersService } from '../../users/users.service';
import { Vendor } from '../models/vendor.model';
import { VendorAccountDetails } from '../models/vendor-account-details.model';
import { City } from '../../catalog/models/city.model';
import { PincodeCityMap } from '../../catalog/models/pincode-city-map.model';
import { CityResolverService } from '../../catalog/city-resolver.service';
import { VENDOR_TEST_MODELS } from './test-db';
import { VendorsController } from '../vendors.controller';
import { VendorsService } from '../vendors.service';
import { VendorCategoriesService } from '../../catalog/vendor-categories.service';
import { Category } from '../../catalog/models/category.model';
import { VendorCategory } from '../../catalog/models/vendor-category.model';
import { OrdersService } from '../../orders/orders.service';
import { VendorHandoverService } from '../../delivery/vendor-handover.service';

export const JWT_SECRET = 'vendor-onboarding-test-jwt-secret-1234567890';

export type VendorOnboardingTestApp = {
  app: INestApplication;
  newVendorUser: () => Promise<{ userId: string; token: string }>;
  createCity: (overrides?: Partial<CityFixture>) => Promise<City>;
  close: () => Promise<void>;
};

type CityFixture = {
  name: string;
  slug: string;
  state: string;
  centroidLat: number;
  centroidLng: number;
  isActive: boolean;
};

// A real Nest app over real test Postgres, exercising the vendor
// self-service controller (onboard / me / me PATCH) — distinct from
// vendors-test-app.ts, which targets the admin controller against an
// already-onboarded vendor. Separated because these routes need
// never-onboarded users and per-test City rows, neither of which the
// admin-focused harness sets up.
//
// OrdersService is stubbed: VendorsController injects it only for the
// order-groups/* routes, none of which this suite exercises, and wiring
// the real OrdersModule here would pull in its whole dependency chain
// for no coverage gain.
export async function createVendorOnboardingTestApp(): Promise<VendorOnboardingTestApp> {
  const suffix = Math.random().toString(36).slice(2, 10);
  const userIds: string[] = [];
  const cityIds: string[] = [];

  const moduleRef: TestingModule = await Test.createTestingModule({
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
        models: VENDOR_TEST_MODELS,
      }),
      SequelizeModule.forFeature([
        User,
        Vendor,
        VendorAccountDetails,
        City,
        PincodeCityMap,
        Category,
        VendorCategory,
      ]),
      PassportModule.register({ defaultStrategy: 'jwt' }),
      JwtModule.register({ secret: JWT_SECRET, signOptions: { expiresIn: '15m' } }),
    ],
    controllers: [VendorsController],
    providers: [
      UsersService,
      JwtStrategy,
      VendorsService,
      CityResolverService,
      VendorCategoriesService,
      { provide: OrdersService, useValue: {} },
      // Stubbed too: only the handover routes use it (decision 0060).
      { provide: VendorHandoverService, useValue: {} },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  await app.init();

  const jwt = moduleRef.get(JwtService);

  return {
    app,
    async newVendorUser() {
      const idx = userIds.length;
      const user = await User.create({
        name: `Onboarding Test Vendor ${idx}`,
        phone: `9${suffix}${idx}`.slice(0, 10),
        role: Role.VENDOR,
        isActive: true,
      } as never);
      userIds.push(user.id);
      return { userId: user.id, token: jwt.sign({ sub: user.id, role: Role.VENDOR }) };
    },
    async createCity(overrides = {}) {
      const idx = cityIds.length;
      const city = await City.create({
        name: overrides.name ?? `Onboarding Test City ${idx}`,
        slug: overrides.slug ?? `onboarding-test-city-${suffix}-${idx}`,
        state: overrides.state ?? 'Test State',
        centroidLat: overrides.centroidLat ?? 28.7041,
        centroidLng: overrides.centroidLng ?? 77.1025,
        isActive: overrides.isActive ?? true,
      } as never);
      cityIds.push(city.id);
      return city;
    },
    async close() {
      await Vendor.destroy({ where: { userId: userIds } });
      await User.destroy({ where: { id: userIds } });
      await City.destroy({ where: { id: cityIds } });
      await app.close();
    },
  };
}
