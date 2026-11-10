import { ConfigModule } from '@nestjs/config';
import { SequelizeModule } from '@nestjs/sequelize';
import { Test, TestingModule } from '@nestjs/testing';

import { loadStorageConfig } from '../../../config/storage.config';
import { PAYMENTS_TEST_MODELS } from '../../orders/__tests__/test-db';
import { DeliveryModule } from '../delivery.module';
import { DriversService } from '../drivers.service';
import { VehiclesService } from '../vehicles.service';

// The real DeliveryModule, with its real imports, must resolve its services
// (DriversService needs OBJECT_STORAGE from CatalogModule). The unit specs
// provide their own wiring, so this is the only check of the module itself.
describe('DeliveryModule wiring (integration)', () => {
  let moduleRef: TestingModule;

  afterAll(async () => {
    await moduleRef.close();
  });

  it('resolves the driver and vehicle services', async () => {
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
          models: PAYMENTS_TEST_MODELS,
        }),
        DeliveryModule,
      ],
    }).compile();

    expect(moduleRef.get(DriversService)).toBeDefined();
    expect(moduleRef.get(VehiclesService)).toBeDefined();
  });
});
