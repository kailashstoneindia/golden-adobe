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
import { User } from '../models/user.model';
import { UsersService } from '../users.service';
import { UsersController } from '../users.controller';
import { VENDOR_TEST_MODELS } from '../../vendors/__tests__/test-db';

export const JWT_SECRET = 'users-controller-test-jwt-secret-1234567890';

export type UsersTestApp = {
  app: INestApplication;
  customerToken: string;
  customerUserId: string;
  close: () => Promise<void>;
};

// Real Nest app over real test Postgres, same rationale as
// apps/backend/src/modules/vendors/__tests__/vendors-test-app.ts. Reuses
// VENDOR_TEST_MODELS since it already satisfies User's full association
// graph (Vendor, Artisan, etc.) — this suite exercises none of that data,
// only User.deviceToken.
export async function createUsersTestApp(): Promise<UsersTestApp> {
  const suffix = Math.random().toString(36).slice(2, 10);

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
      SequelizeModule.forFeature([User]),
      PassportModule.register({ defaultStrategy: 'jwt' }),
      JwtModule.register({ secret: JWT_SECRET, signOptions: { expiresIn: '15m' } }),
    ],
    controllers: [UsersController],
    providers: [UsersService, JwtStrategy],
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

  const customerUser = await User.create({
    name: 'Users Test Customer',
    phone: `9${suffix}`.slice(0, 10),
    role: Role.CUSTOMER,
    isActive: true,
  } as never);

  return {
    app,
    customerToken: jwt.sign({ sub: customerUser.id, role: Role.CUSTOMER }),
    customerUserId: customerUser.id,
    async close() {
      await User.destroy({ where: { id: customerUser.id } });
      await app.close();
    },
  };
}
