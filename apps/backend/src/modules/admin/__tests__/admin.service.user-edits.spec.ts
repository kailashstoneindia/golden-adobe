import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException, Logger, NotFoundException } from '@nestjs/common';
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

// Decision 0058 Task 9: the admin fixes a user's name, email and phone,
// switches the account on or off, and signs them out everywhere.
describe('AdminService user edits (integration)', () => {
  let moduleRef: TestingModule;
  let admin: AdminService;
  let sequelize: Sequelize;
  const createdUserIds: string[] = [];
  const ADMIN_ID = 'admin-1';

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

  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    await sequelize.query(`DELETE FROM refresh_tokens WHERE user_id IN (:ids)`, {
      replacements: { ids: createdUserIds },
      type: QueryTypes.DELETE,
    });
    await sequelize.query(`DELETE FROM users WHERE id IN (:ids)`, {
      replacements: { ids: createdUserIds },
      type: QueryTypes.DELETE,
    });
    await moduleRef.close();
  });

  const uniquePhone = () => `+916${Math.floor(Math.random() * 1e9)}`.padEnd(13, '0').slice(0, 13);

  async function newUser(extra: Record<string, unknown> = {}): Promise<User> {
    const user = await User.create({
      name: 'Edit Test User',
      phone: uniquePhone(),
      role: Role.CUSTOMER,
      isActive: true,
      ...extra,
    } as never);
    createdUserIds.push(user.id);
    return user;
  }

  async function sessions(userId: string, isRevoked: boolean) {
    const hour = 60 * 60 * 1000;
    return RefreshToken.create({
      token: randomUUID(),
      userId,
      expiresAt: new Date(Date.now() + hour),
      isRevoked,
    } as never);
  }

  const revokedCount = async (userId: string) =>
    RefreshToken.count({ where: { userId, isRevoked: true } });

  describe('updateUser', () => {
    it('changes only the fields it is given, and returns the admin detail', async () => {
      const user = await newUser({ email: 'old@example.com' });
      const phone = user.phone;

      const result = await admin.updateUser(user.id, ADMIN_ID, { name: 'Asha Rao' });

      expect(result).toMatchObject({
        id: user.id,
        name: 'Asha Rao',
        email: 'old@example.com',
        phone,
      });
      expect(result).not.toHaveProperty('deviceToken');
      const stored = (await User.findByPk(user.id))!;
      expect([stored.name, stored.email, stored.phone]).toEqual([
        'Asha Rao',
        'old@example.com',
        phone,
      ]);
    });

    it('stores an email in lower case, as admin login looks it up', async () => {
      const user = await newUser();

      await admin.updateUser(user.id, ADMIN_ID, { email: ' Asha@Example.COM ' });

      expect((await User.findByPk(user.id))!.email).toBe('asha@example.com');
    });

    it('changes the phone', async () => {
      const user = await newUser();
      const phone = uniquePhone();

      await admin.updateUser(user.id, ADMIN_ID, { phone });

      expect((await User.findByPk(user.id))!.phone).toBe(phone);
    });

    it('refuses a phone another account already uses, with 409, and changes nothing', async () => {
      const taken = await newUser();
      const user = await newUser();
      const before = user.phone;

      await expect(admin.updateUser(user.id, ADMIN_ID, { phone: taken.phone! })).rejects.toThrow(
        ConflictException,
      );

      expect((await User.findByPk(user.id))!.phone).toBe(before);
    });

    it('refuses an email another account already uses, with 409', async () => {
      const taken = await newUser({ email: `taken-${randomUUID()}@example.com` });
      const user = await newUser();

      await expect(
        admin.updateUser(user.id, ADMIN_ID, { email: taken.email!.toUpperCase() }),
      ).rejects.toThrow(ConflictException);
    });

    it('does not count the user’s own current phone as a clash', async () => {
      const user = await newUser();

      await expect(
        admin.updateUser(user.id, ADMIN_ID, { phone: user.phone!, name: 'Same Phone' }),
      ).resolves.toMatchObject({ name: 'Same Phone' });
    });

    it('404s for an unknown user', async () => {
      await expect(admin.updateUser(randomUUID(), ADMIN_ID, { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('logs which admin changed which fields, and only the ones that changed', async () => {
      const user = await newUser({ name: 'Keep Name' });
      const log = jest.spyOn(Logger.prototype, 'log');

      await admin.updateUser(user.id, ADMIN_ID, { name: 'Keep Name', email: 'log@example.com' });

      expect(log.mock.calls.map((call) => String(call[0]))).toContain(
        `admin ${ADMIN_ID} update user ${user.id} email`,
      );
    });

    it('writes nothing and logs nothing when nothing changed', async () => {
      const user = await newUser({ name: 'Same Name' });
      const log = jest.spyOn(Logger.prototype, 'log');

      await admin.updateUser(user.id, ADMIN_ID, { name: 'Same Name' });

      expect(log).not.toHaveBeenCalled();
    });
  });

  describe('setUserActive', () => {
    it('deactivating switches the account off and signs the user out everywhere', async () => {
      const user = await newUser();
      await sessions(user.id, false);
      await sessions(user.id, false);
      const other = await newUser();
      await sessions(other.id, false);

      const result = await admin.setUserActive(user.id, ADMIN_ID, false);

      expect(result).toMatchObject({ isActive: false, activeSessionCount: 0 });
      expect((await User.findByPk(user.id))!.isActive).toBe(false);
      expect(await revokedCount(user.id)).toBe(2);
      // Another user's sessions are untouched.
      expect(await revokedCount(other.id)).toBe(0);
    });

    it('reactivating switches the account back on without restoring sessions', async () => {
      const user = await newUser({ isActive: false });

      const result = await admin.setUserActive(user.id, ADMIN_ID, true);

      expect(result).toMatchObject({ isActive: true, activeSessionCount: 0 });
    });

    it('refuses to deactivate the admin’s own account', async () => {
      const self = await newUser({ role: Role.ADMIN });

      await expect(admin.setUserActive(self.id, self.id, false)).rejects.toThrow(
        BadRequestException,
      );

      expect((await User.findByPk(self.id))!.isActive).toBe(true);
    });

    it('404s for an unknown user', async () => {
      await expect(admin.setUserActive(randomUUID(), ADMIN_ID, false)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('logs the action', async () => {
      const user = await newUser();
      const log = jest.spyOn(Logger.prototype, 'log');

      await admin.setUserActive(user.id, ADMIN_ID, false);
      await admin.setUserActive(user.id, ADMIN_ID, true);

      const lines = log.mock.calls.map((call) => String(call[0]));
      expect(lines).toContain(`admin ${ADMIN_ID} deactivate user ${user.id} isActive,sessions`);
      expect(lines).toContain(`admin ${ADMIN_ID} reactivate user ${user.id} isActive`);
    });
  });

  describe('revokeUserSessions', () => {
    it('signs the user out everywhere, leaves the account on, and touches nobody else', async () => {
      const user = await newUser();
      await sessions(user.id, false);
      await sessions(user.id, false);
      await sessions(user.id, true);
      const other = await newUser();
      await sessions(other.id, false);

      const result = await admin.revokeUserSessions(user.id, ADMIN_ID);

      expect(result).toMatchObject({ isActive: true, activeSessionCount: 0 });
      expect(await revokedCount(user.id)).toBe(3);
      expect(await revokedCount(other.id)).toBe(0);
    });

    it('404s for an unknown user', async () => {
      await expect(admin.revokeUserSessions(randomUUID(), ADMIN_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('logs the action', async () => {
      const user = await newUser();
      const log = jest.spyOn(Logger.prototype, 'log');

      await admin.revokeUserSessions(user.id, ADMIN_ID);

      expect(log.mock.calls.map((call) => String(call[0]))).toContain(
        `admin ${ADMIN_ID} revoke-sessions user ${user.id} sessions`,
      );
    });
  });
});
