import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { SequelizeModule } from '@nestjs/sequelize';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@golden-abode/types';

import { StorageConfig } from '../../../../config/storage.config';
import { GlobalExceptionFilter } from '../../../../common/filters/global-exception.filter';
import { ResponseInterceptor } from '../../../../common/interceptors/response.interceptor';
import { JwtStrategy } from '../../../auth/strategies/jwt.strategy';
import { User } from '../../../users/models/user.model';
import { UsersService } from '../../../users/users.service';
import { CATALOG_TEST_MODELS } from '../../__tests__/test-db';
import { Category } from '../../models/category.model';
import { MasterProduct, MasterProductStatus } from '../../models/master-product.model';
import { MasterProductMedia } from '../../models/master-product-media.model';
import { AdminMediaController } from '../admin-media.controller';
import { InternalMediaController } from '../internal-media.controller';
import { MediaCallbackSignatureGuard } from '../media-callback-signature.guard';
import { MediaService } from '../media.service';
import { MEDIA_STORAGE_CONFIG, OBJECT_STORAGE } from '../object-storage';
import { ensureLocalBucket } from '../local-bucket';
import { S3ObjectStorage, createS3Client } from '../s3-object-storage.service';
import { TEST_BUCKET, testStorageConfig } from './media-test-helpers';

export const JWT_SECRET = 'media-controller-test-jwt-secret-1234567890';

export type MediaTestApp = {
  app: INestApplication;
  config: StorageConfig;
  storage: S3ObjectStorage;
  adminToken: string;
  vendorToken: string;
  newProductId: () => Promise<string>;
  close: () => Promise<void>;
};

// A real Nest app: the real controllers, guards, validation pipe, exception
// filter and response envelope, wired the way main.ts wires them, over the real
// test Postgres and MinIO. Only the module wiring is trimmed to what these two
// controllers need.
export async function createMediaTestApp(): Promise<MediaTestApp> {
  const config = testStorageConfig({
    MEDIA_MAX_UPLOAD_BYTES: String(64 * 1024),
    MEDIA_MAX_PER_PRODUCT: '3',
  });
  const storage = new S3ObjectStorage(config);
  const suffix = `c${Date.now()}${Math.floor(Math.random() * 1000)}`;

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
        models: CATALOG_TEST_MODELS,
      }),
      SequelizeModule.forFeature([MasterProduct, MasterProductMedia, User]),
      PassportModule.register({ defaultStrategy: 'jwt' }),
      JwtModule.register({ secret: JWT_SECRET, signOptions: { expiresIn: '15m' } }),
    ],
    controllers: [AdminMediaController, InternalMediaController],
    providers: [
      UsersService,
      JwtStrategy,
      MediaService,
      MediaCallbackSignatureGuard,
      { provide: OBJECT_STORAGE, useValue: storage },
      { provide: MEDIA_STORAGE_CONFIG, useValue: config },
    ],
  }).compile();

  const app = moduleRef.createNestApplication({ rawBody: true });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  await app.init();

  await ensureLocalBucket(createS3Client(config), TEST_BUCKET);

  const jwt = moduleRef.get(JwtService);
  const admin = await User.create({
    name: 'Media Test Admin',
    email: `media-admin-${suffix}@test.local`,
    role: Role.ADMIN,
    isActive: true,
  } as never);
  const vendor = await User.create({
    name: 'Media Test Vendor',
    email: `media-vendor-${suffix}@test.local`,
    role: Role.VENDOR,
    isActive: true,
  } as never);

  const category = await Category.create({
    name: `Media App Cat ${suffix}`,
    slug: `media-app-cat-${suffix}`,
    level: 1,
    path: `media-app-cat-${suffix}`,
    isLeaf: true,
  } as never);
  const productIds: string[] = [];

  return {
    app,
    config,
    storage,
    adminToken: jwt.sign({ sub: admin.id, role: Role.ADMIN }),
    vendorToken: jwt.sign({ sub: vendor.id, role: Role.VENDOR }),
    async newProductId() {
      const product = await MasterProduct.create({
        categoryId: category.id,
        name: `Media App Product ${suffix}-${productIds.length}`,
        slug: `media-app-product-${suffix}-${productIds.length}`,
        isGeneric: true,
        status: MasterProductStatus.LIVE,
      } as never);
      productIds.push(product.id);
      return product.id;
    },
    async close() {
      for (const productId of productIds) {
        for (const prefix of [
          `original/products/${productId}/`,
          `variants/products/${productId}/`,
        ]) {
          const page = await storage.list(prefix);
          await storage.deleteMany(page.objects.map((o) => o.key));
        }
      }
      await MasterProduct.sequelize!.query(
        `DELETE FROM search_outbox WHERE entity_id = ANY(CAST(:ids AS uuid[]))`,
        { replacements: { ids: `{${productIds.join(',')}}` } },
      );
      await MasterProduct.destroy({ where: { id: productIds } });
      await Category.destroy({ where: { id: category.id } });
      await User.destroy({ where: { id: [admin.id, vendor.id] } });
      await app.close();
    },
  };
}
