import { BadRequestException, Logger } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@golden-abode/types';

import { ARTISAN_TEST_MODELS } from '../../artisans/__tests__/test-db';
import { FakeObjectStorage } from '../../artisans/__tests__/fake-object-storage';
import { ArtisansService } from '../../artisans/artisans.service';
import { Artisan } from '../../artisans/models/artisan.model';
import { ArtisanAccountDetails } from '../../artisans/models/artisan-account-details.model';
import { ArtisanTeamMember } from '../../artisans/models/artisan-team-member.model';
import { ArtisanHireRequest } from '../../artisans/models/artisan-hire-request.model';
import { CityResolverService } from '../../catalog/city-resolver.service';
import { City } from '../../catalog/models/city.model';
import { PincodeCityMap } from '../../catalog/models/pincode-city-map.model';
import { OBJECT_STORAGE } from '../../catalog/media/object-storage';
import { User } from '../../users/models/user.model';
import { UsersService } from '../../users/users.service';
import { Vendor } from '../../vendors/models/vendor.model';
import { VendorAccountDetails } from '../../vendors/models/vendor-account-details.model';
import { VendorsService } from '../../vendors/vendors.service';
import { AdminService } from '../admin.service';
import { Customer } from '../../customers/models/customer.model';
import { CustomerAddress } from '../../customers/models/customer-address.model';

// Follow-up F2 (decision 0058): the generic users-page approve/reject must
// keep a vendor's two records in step (vendors.status and users.is_approved),
// the way 0058 §3b does for ustaads.
describe('AdminService vendor approval from the users page (integration)', () => {
  let moduleRef: TestingModule;
  let admin: AdminService;
  let userId: string;

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
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    const user = await User.create({
      name: `Vendor approval ${Date.now()}`,
      phone: `5${Date.now()}`.slice(0, 10),
      role: Role.VENDOR,
      isActive: true,
    } as never);
    userId = user.id;
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await Vendor.destroy({ where: { userId } });
    await User.destroy({ where: { id: userId } });
  });

  async function shop() {
    return Vendor.create({
      userId,
      shopName: 'Approval Test Shop',
      address: '1 Test Street',
      latitude: 28.7,
      longitude: 77.1,
    } as never);
  }

  async function state() {
    const user = await User.findByPk(userId);
    const vendor = await Vendor.findOne({ where: { userId } });
    return {
      isApproved: user!.isApproved,
      status: vendor?.status ?? null,
      rejectionReason: vendor?.rejectionReason ?? null,
    };
  }

  it('approving a vendor approves the vendor record too', async () => {
    await shop();

    await admin.approveUser(userId, 'admin-1');

    expect(await state()).toEqual({ isApproved: true, status: 'APPROVED', rejectionReason: null });
  });

  it('rejecting a vendor needs a reason and changes nothing without one', async () => {
    await shop();
    await User.update({ isApproved: true }, { where: { id: userId } });

    await expect(admin.rejectUser(userId, 'admin-1')).rejects.toThrow(BadRequestException);

    expect((await state()).isApproved).toBe(true);
  });

  it('rejecting a vendor with a reason rejects the vendor record and keeps the reason', async () => {
    await shop();

    await admin.rejectUser(userId, 'admin-1', 'GSTIN does not match');

    expect(await state()).toEqual({
      isApproved: false,
      status: 'REJECTED',
      rejectionReason: 'GSTIN does not match',
    });
  });

  it('a vendor who has not onboarded yet only has the account flag to change', async () => {
    await admin.approveUser(userId, 'admin-1');

    expect(await state()).toEqual({ isApproved: true, status: null, rejectionReason: null });
  });

  it('logs which admin rejected the vendor, with the reason', async () => {
    const vendor = await shop();
    const log = jest.spyOn(Logger.prototype, 'log');

    await admin.rejectUser(userId, 'admin-9', 'Fake GSTIN');

    expect(log.mock.calls.map((call) => String(call[0]))).toContain(
      `admin admin-9 reject vendor ${vendor.id} status,isApproved,rejectionReason: Fake GSTIN`,
    );
  });

  it('logs which admin approved the vendor', async () => {
    const vendor = await shop();
    const log = jest.spyOn(Logger.prototype, 'log');

    await admin.approveUser(userId, 'admin-9');

    expect(log.mock.calls.map((call) => String(call[0]))).toContain(
      `admin admin-9 approve vendor ${vendor.id} status,isApproved`,
    );
  });
});
