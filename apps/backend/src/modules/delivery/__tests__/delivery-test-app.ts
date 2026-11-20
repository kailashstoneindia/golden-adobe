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

  // Specs run in parallel against one database, so cleanup removes only the
  // rows this module instance created (found through create hooks), never
  // everything that merely looks like test data.
  const created = {
    drivers: new Set<string>(),
    users: new Set<string>(),
    vehicles: new Set<string>(),
  };
  const hookName = `delivery-test-${Math.random().toString(36).slice(2)}`;
  const track = (set: Set<string>) => (instance: unknown) => {
    set.add((instance as { id: string }).id);
  };
  Driver.addHook('afterCreate', hookName, track(created.drivers));
  User.addHook('afterCreate', hookName, track(created.users));
  Vehicle.addHook('afterCreate', hookName, track(created.vehicles));

  return {
    moduleRef,
    storage,
    // Deletes what this module instance created, children first.
    async cleanup() {
      Driver.removeHook('afterCreate', hookName);
      User.removeHook('afterCreate', hookName);
      Vehicle.removeHook('afterCreate', hookName);
      const run = (sql: string, ids: Set<string>) =>
        ids.size === 0
          ? Promise.resolve()
          : sequelize.query(sql, { replacements: { ids: [...ids] }, type: QueryTypes.DELETE });
      await run('DELETE FROM drivers WHERE id IN (:ids)', created.drivers);
      await run("DELETE FROM users WHERE id IN (:ids) AND role = 'DRIVER'", created.users);
      await run('DELETE FROM vehicles WHERE id IN (:ids)', created.vehicles);
      await moduleRef.close();
    },
  };
}
