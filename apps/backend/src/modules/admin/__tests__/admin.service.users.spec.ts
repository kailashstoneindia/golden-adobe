import { randomUUID } from 'crypto';
import { SequelizeModule } from '@nestjs/sequelize';
import { Test, TestingModule } from '@nestjs/testing';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';
import { Role } from '@golden-abode/types';

import { ARTISAN_TEST_MODELS } from '../../artisans/__tests__/test-db';
import { FakeObjectStorage } from '../../artisans/__tests__/fake-object-storage';
import { ArtisansService } from '../../artisans/artisans.service';
import { Artisan } from '../../artisans/models/artisan.model';
import { ArtisanAccountDetails } from '../../artisans/models/artisan-account-details.model';
import { ArtisanHireRequest } from '../../artisans/models/artisan-hire-request.model';
import { ArtisanTeamMember } from '../../artisans/models/artisan-team-member.model';
import { CityResolverService } from '../../catalog/city-resolver.service';
import { City } from '../../catalog/models/city.model';
import { PincodeCityMap } from '../../catalog/models/pincode-city-map.model';
import { OBJECT_STORAGE } from '../../catalog/media/object-storage';
import { Customer } from '../../customers/models/customer.model';
import { CustomerAddress } from '../../customers/models/customer-address.model';
import { RefreshToken } from '../../users/models/refresh-token.model';
import { User } from '../../users/models/user.model';
import { UsersService } from '../../users/users.service';
import { Vendor } from '../../vendors/models/vendor.model';
import { VendorAccountDetails } from '../../vendors/models/vendor-account-details.model';
import { VendorsService } from '../../vendors/vendors.service';
import { AdminService } from '../admin.service';

// Decision 0058 Task 7: the admin sees whether push is on (never the device
// token), how many devices are signed in, and a customer's profile and totals.
describe('AdminService users (integration)', () => {
  let moduleRef: TestingModule;
  let admin: AdminService;
  let sequelize: Sequelize;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        SequelizeModule.forRoot({
          dialect: 'postgres',
          host: process.env.TEST_DB_HOST ?? '127.0.0.1',
          port: Number(process.env.TEST_DB_PORT ?? 5432),
          username: process.env.TEST_DB_USER ?? 'postgres',
          password: process.env.TEST_DB_PASS ?? 'postgres',
          database: process.env.TEST_DB_NAME ?? 'golden_abode_test',
          logging: false,
          models: [...ARTISAN_TEST_MODELS, PincodeCityMap, Customer, CustomerAddress],
        }),
        SequelizeModule.forFeature([
          User,
          Vendor,
          VendorAccountDetails,
          City,
          PincodeCityMap,
          Artisan,
          ArtisanAccountDetails,
          ArtisanTeamMember,
          ArtisanHireRequest,
          Customer,
        ]),
      ],
      providers: [
        AdminService,
        ArtisansService,
        UsersService,
        VendorsService,
        CityResolverService,
        { provide: OBJECT_STORAGE, useValue: new FakeObjectStorage() },
      ],
    }).compile();
    admin = moduleRef.get(AdminService);
    sequelize = moduleRef.get(Sequelize);
  });

  afterAll(async () => {
    const run = (sql: string) =>
      sequelize.query(sql, { replacements: { ids: createdUserIds }, type: QueryTypes.DELETE });
    await run(`DELETE FROM artisan_hire_requests WHERE customer_id IN (:ids)`);
    await run(`DELETE FROM artisans WHERE user_id IN (:ids)`);
    await run(
      `DELETE FROM orders WHERE customer_id IN (SELECT id FROM customers WHERE user_id IN (:ids))`,
    );
    await run(
      `DELETE FROM customer_addresses WHERE customer_id IN (SELECT id FROM customers WHERE user_id IN (:ids))`,
    );
    await run(`DELETE FROM customers WHERE user_id IN (:ids)`);
    await run(`DELETE FROM refresh_tokens WHERE user_id IN (:ids)`);
    await run(`DELETE FROM users WHERE id IN (:ids)`);
    await moduleRef.close();
  });

  async function newUser(role: Role, extra: Record<string, unknown> = {}): Promise<User> {
    const user = await User.create({
      name: `Admin users test ${role}`,
      phone: `6${Math.floor(Math.random() * 1e9)}`.padEnd(10, '0').slice(0, 10),
      role,
      isActive: true,
      ...extra,
    } as never);
    createdUserIds.push(user.id);
    return user;
  }

  it('user detail never contains the device token, only whether push is on', async () => {
    const user = await newUser(Role.CUSTOMER, { deviceToken: 'fcm-secret-token' });
    const silent = await newUser(Role.CUSTOMER);

    const detail = await admin.getUserById(user.id);

    expect(detail).not.toHaveProperty('deviceToken');
    expect(JSON.stringify(detail)).not.toContain('fcm-secret-token');
    expect(detail.pushEnabled).toBe(true);
    expect((await admin.getUserById(silent.id)).pushEnabled).toBe(false);
  });

  it('user lists never contain the device token either', async () => {
    const user = await newUser(Role.CUSTOMER, { deviceToken: 'fcm-list-token' });

    const page = await admin.listUsers({ search: user.phone!, page: 1, limit: 20 });

    expect(page.items).toHaveLength(1);
    expect(page.items[0]).not.toHaveProperty('deviceToken');
    expect(page.items[0].pushEnabled).toBe(true);
  });

  it('counts only live sessions', async () => {
    const user = await newUser(Role.CUSTOMER);
    const hour = 60 * 60 * 1000;
    const token = (expiresAt: Date, isRevoked: boolean) =>
      RefreshToken.create({ token: randomUUID(), userId: user.id, expiresAt, isRevoked } as never);
    await token(new Date(Date.now() + hour), false);
    await token(new Date(Date.now() + hour), false);
    await token(new Date(Date.now() + hour), true);
    await token(new Date(Date.now() - hour), false);

    expect((await admin.getUserById(user.id)).activeSessionCount).toBe(2);
  });

  it('shows a customer’s profile with addresses and totals', async () => {
    const user = await newUser(Role.CUSTOMER);
    const customer = await Customer.create({ userId: user.id, fullName: 'Asha Rao' } as never);
    const home = await CustomerAddress.create({
      customerId: customer.id,
      label: 'Home',
      addressLine1: '12 MG Road',
      city: 'Bengaluru',
      pincode: '560001',
      isDefault: true,
    } as never);
    await CustomerAddress.create({
      customerId: customer.id,
      label: 'Site',
      addressLine1: '4 Ring Road',
      city: 'Bengaluru',
      pincode: '560002',
    } as never);
    const order = (status: string, capturedPaise: number | null) =>
      sequelize.query(
        `INSERT INTO orders (id, customer_id, delivery_address_id, grand_total, status, captured_paise, created_at, updated_at)
         VALUES (:id, :customerId, :addressId, 100, :status, :capturedPaise, now(), now())`,
        {
          replacements: {
            id: randomUUID(),
            customerId: customer.id,
            addressId: home.id,
            status,
            capturedPaise,
          },
        },
      );
    await order('confirmed', 50_000);
    await order('refunded', 20_000);
    await order('pending_payment', null);
    // Hire requests point at the user, not the customer record.
    const ustaadUser = await newUser(Role.ARTISAN);
    const ustaad = await Artisan.create({ userId: ustaadUser.id, tradeType: 'MASON' } as never);
    await ArtisanHireRequest.create({
      customerId: user.id,
      artisanId: ustaad.id,
      addressText: '12 MG Road',
      status: 'COMPLETED',
    } as never);

    const detail = await admin.getUserById(user.id);

    expect(detail.customerProfile).toMatchObject({
      customerId: customer.id,
      fullName: 'Asha Rao',
      orderCount: 3,
      paidTotalPaise: 70_000,
      hireRequestCount: 1,
    });
    expect(detail.customerProfile!.addresses.map((a) => a.label).sort()).toEqual(['Home', 'Site']);
  });

  it('gives a customer with no orders zero totals', async () => {
    const user = await newUser(Role.CUSTOMER);
    await Customer.create({ userId: user.id, fullName: 'New Customer' } as never);

    expect((await admin.getUserById(user.id)).customerProfile).toMatchObject({
      addresses: [],
      orderCount: 0,
      paidTotalPaise: 0,
      hireRequestCount: 0,
    });
  });

  it('gives someone with no customer profile a null customerProfile', async () => {
    const user = await newUser(Role.VENDOR);

    expect((await admin.getUserById(user.id)).customerProfile).toBeNull();
  });

  it('approving answers with the admin view, without the device token', async () => {
    const user = await newUser(Role.VENDOR, { deviceToken: 'fcm-approve-token' });

    const result = await admin.approveUser(user.id, 'admin-1');

    expect(result).not.toHaveProperty('deviceToken');
    expect(result.pushEnabled).toBe(true);
  });
});
