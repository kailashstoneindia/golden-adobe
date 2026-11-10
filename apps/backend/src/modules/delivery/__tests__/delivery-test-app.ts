import { ConfigModule } from '@nestjs/config';
import { SequelizeModule } from '@nestjs/sequelize';
import { Test, TestingModule } from '@nestjs/testing';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';

import { PAYMENTS_TEST_MODELS } from '../../orders/__tests__/test-db';
import { FakeObjectStorage } from '../../artisans/__tests__/fake-object-storage';
import { OBJECT_STORAGE } from '../../catalog/media/object-storage';
import { User } from '../../users/models/user.model';
import { Vehicle } from '../models/vehicle.model';
import { Driver } from '../models/driver.model';
import { DeliveryAssignment } from '../models/delivery-assignment.model';

// Real Postgres, real models, fake object storage: the delivery services are
// tested against the actual constraints (unique registration, one driver per
// user). Providers are passed in by each spec.
export async function createDeliveryTestModule(providers: unknown[]): Promise<{
  moduleRef: TestingModule;
  storage: FakeObjectStorage;
  cleanup: () => Promise<void>;
}> {
  const storage = new FakeObjectStorage();
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
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
      SequelizeModule.forFeature([Vehicle, Driver, DeliveryAssignment, User]),
    ],
    providers: [...(providers as never[]), { provide: OBJECT_STORAGE, useValue: storage }],
  }).compile();

  const sequelize = moduleRef.get(Sequelize);
  return {
    moduleRef,
    storage,
    // Deletes everything this spec created, found by the marker it put in
    // names/registrations, children first.
    async cleanup() {
      const run = (sql: string) => sequelize.query(sql, { type: QueryTypes.DELETE });
      await run(`DELETE FROM drivers WHERE licence_number LIKE 'TEST-%'`);
      await run(`DELETE FROM users WHERE name LIKE 'Test Driver%' AND role = 'DRIVER'`);
      await run(`DELETE FROM vehicles WHERE registration_number LIKE 'TEST%'`);
      await moduleRef.close();
    },
  };
}
