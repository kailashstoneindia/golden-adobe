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
import { AdminVendorsController } from '../admin-vendors.controller';
import { VendorsService } from '../vendors.service';
import { VendorCategoriesService } from '../../catalog/vendor-categories.service';
import { Category } from '../../catalog/models/category.model';
import { VendorCategory } from '../../catalog/models/vendor-category.model';

export const JWT_SECRET = 'vendors-controller-test-jwt-secret-1234567890';

export type VendorsTestApp = {
  app: INestApplication;
  adminToken: string;
  vendorToken: string;
  vendorUserId: string;
  newVendor: () => Promise<{ userId: string; vendorId: string }>;
  close: () => Promise<void>;
};

// A real Nest app over real test Postgres — the real controller, guards,
// validation pipe, exception filter and response envelope, wired the way
// main.ts wires them. Mirrors
// apps/backend/src/modules/artisans/__tests__/artisans-test-app.ts's own
// rationale.
export async function createVendorsTestApp(): Promise<VendorsTestApp> {
  const suffix = Math.random().toString(36).slice(2, 10);
  const extraUserIds: string[] = [];
  const extraVendorIds: string[] = [];

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
    controllers: [AdminVendorsController],
    providers: [
      UsersService,
      JwtStrategy,
      VendorsService,
      CityResolverService,
      VendorCategoriesService,
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

  const admin = await User.create({
    name: 'Vendors Test Admin',
    phone: `7${suffix}`.slice(0, 10),
    role: Role.ADMIN,
    isActive: true,
  } as never);

  const vendorUser = await User.create({
    name: 'Vendors Test Vendor',
    phone: `9${suffix}`.slice(0, 10),
    role: Role.VENDOR,
    isActive: true,
  } as never);
  const vendor = await Vendor.create({
    userId: vendorUser.id,
    shopName: 'Test Shop',
    address: '1 Test Street',
    latitude: 28.7041,
    longitude: 77.1025,
  } as never);

  return {
    app,
    adminToken: jwt.sign({ sub: admin.id, role: Role.ADMIN }),
    vendorToken: jwt.sign({ sub: vendorUser.id, role: Role.VENDOR }),
    vendorUserId: vendorUser.id,
    async newVendor() {
      const idx = extraUserIds.length;
      const user = await User.create({
        name: `Vendors Test Vendor ${idx}`,
        phone: `6${suffix}${idx}`.slice(0, 10),
        role: Role.VENDOR,
        isActive: true,
      } as never);
      const v = await Vendor.create({
        userId: user.id,
        shopName: `Test Shop ${idx}`,
        address: '1 Test Street',
        latitude: 28.7041,
        longitude: 77.1025,
      } as never);
      extraUserIds.push(user.id);
      extraVendorIds.push(v.id);
      return { userId: user.id, vendorId: v.id };
    },
    async close() {
      await Vendor.destroy({ where: { id: [vendor.id, ...extraVendorIds] } });
      await User.destroy({ where: { id: [admin.id, vendorUser.id, ...extraUserIds] } });
      await app.close();
    },
  };
}
