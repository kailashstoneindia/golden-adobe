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
import { loadStorageConfig } from '../../../config/storage.config';
import {
  MEDIA_STORAGE_CONFIG,
  OBJECT_STORAGE,
} from '../../catalog/media/object-storage';
import { S3ObjectStorage } from '../../catalog/media/s3-object-storage.service';
import { ARTISAN_TEST_MODELS } from './test-db';
import { Artisan } from '../models/artisan.model';
import { ArtisanAccountDetails } from '../models/artisan-account-details.model';
import { ArtisanTeamMember } from '../models/artisan-team-member.model';
import { ArtisanHireRequest } from '../models/artisan-hire-request.model';
import { ArtisanCompletionEstimate } from '../models/artisan-completion-estimate.model';
import { ArtisansController } from '../artisans.controller';
import { ArtisansService } from '../artisans.service';
import { HireRequestsService } from '../hire-requests.service';

export const JWT_SECRET = 'artisans-controller-test-jwt-secret-1234567890';

export type ArtisansTestApp = {
  app: INestApplication;
  adminToken: string;
  artisanToken: string;
  artisanUserId: string;
  customerToken: string;
  customerUserId: string;
  newArtisanUser: () => Promise<{ id: string; token: string }>;
  close: () => Promise<void>;
};

// A real Nest app: the real controller, guards, validation pipe,
// exception filter and response envelope, wired the way main.ts wires
// them, over the real test Postgres. Mirrors
// apps/backend/src/modules/catalog/media/__tests__/media-test-app.ts's
// own rationale. No MinIO/S3 network call is exercised by these tests —
// S3ObjectStorage's constructor doesn't touch the network — so OBJECT_STORAGE
// is wired for real but never actually asked to presign in these specs.
export async function createArtisansTestApp(): Promise<ArtisansTestApp> {
  const suffix = `c${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const extraUserIds: string[] = [];

  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [
          () => ({
            jwt: { accessSecret: JWT_SECRET },
            storage: loadStorageConfig(),
          }),
        ],
      }),
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
      SequelizeModule.forFeature([
        User,
        Artisan,
        ArtisanAccountDetails,
        ArtisanTeamMember,
        ArtisanHireRequest,
        ArtisanCompletionEstimate,
      ]),
      PassportModule.register({ defaultStrategy: 'jwt' }),
      JwtModule.register({ secret: JWT_SECRET, signOptions: { expiresIn: '15m' } }),
    ],
    controllers: [ArtisansController],
    providers: [
      UsersService,
      JwtStrategy,
      ArtisansService,
      HireRequestsService,
      {
        provide: MEDIA_STORAGE_CONFIG,
        useFactory: () => loadStorageConfig(),
      },
      {
        provide: OBJECT_STORAGE,
        inject: [MEDIA_STORAGE_CONFIG],
        useFactory: (config: ReturnType<typeof loadStorageConfig>) =>
          new S3ObjectStorage(config),
      },
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
    name: 'Artisans Test Admin',
    phone: `7${suffix}`.slice(0, 10),
    role: Role.ADMIN,
    isActive: true,
  } as never);
  const artisanUser = await User.create({
    name: 'Artisans Test Artisan',
    phone: `9${suffix}`.slice(0, 10),
    role: Role.ARTISAN,
    isActive: true,
  } as never);
  const customerUser = await User.create({
    name: 'Artisans Test Customer',
    phone: `8${suffix}`.slice(0, 10),
    role: Role.CUSTOMER,
    isActive: true,
  } as never);

  return {
    app,
    adminToken: jwt.sign({ sub: admin.id, role: Role.ADMIN }),
    artisanToken: jwt.sign({ sub: artisanUser.id, role: Role.ARTISAN }),
    artisanUserId: artisanUser.id,
    customerToken: jwt.sign({ sub: customerUser.id, role: Role.CUSTOMER }),
    customerUserId: customerUser.id,
    async newArtisanUser() {
      const user = await User.create({
        name: `Artisans Test Artisan ${extraUserIds.length}`,
        phone: `6${suffix}${extraUserIds.length}`.slice(0, 10),
        role: Role.ARTISAN,
        isActive: true,
      } as never);
      extraUserIds.push(user.id);
      return { id: user.id, token: jwt.sign({ sub: user.id, role: Role.ARTISAN }) };
    },
    async close() {
      await ArtisanHireRequest.destroy({ where: { customerId: customerUser.id } });
      await Artisan.destroy({ where: { userId: [artisanUser.id, ...extraUserIds] } });
      await User.destroy({ where: { id: [admin.id, artisanUser.id, customerUser.id, ...extraUserIds] } });
      await app.close();
    },
  };
}
