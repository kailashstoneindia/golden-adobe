import { ConfigModule } from '@nestjs/config';
import { SequelizeModule } from '@nestjs/sequelize';
import { Test, TestingModule } from '@nestjs/testing';

import { CatalogModule } from '../../catalog/catalog.module';
import { OBJECT_STORAGE } from '../../catalog/media/object-storage';
import { loadStorageConfig } from '../../../config/storage.config';
import { CATALOG_TEST_MODELS } from '../../catalog/__tests__/test-db';

// Proves ArtisansModule's planned dependency on OBJECT_STORAGE (reusing the
// existing presigned-POST S3 plumbing, decision 0033, rather than building
// a second object-storage integration) is actually resolvable once
// CatalogModule is imported. No MinIO/S3 call is made here — constructing
// S3ObjectStorage doesn't touch the network, it only needs a StorageConfig
// — so this runs against real Postgres only.
describe('CatalogModule OBJECT_STORAGE export (integration)', () => {
  let moduleRef: TestingModule;

  afterAll(async () => {
    await moduleRef.close();
  });

  it('resolves OBJECT_STORAGE when CatalogModule is imported', async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ storage: loadStorageConfig() })],
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
        CatalogModule,
      ],
    }).compile();

    expect(moduleRef.get(OBJECT_STORAGE)).toBeDefined();
  });
});
