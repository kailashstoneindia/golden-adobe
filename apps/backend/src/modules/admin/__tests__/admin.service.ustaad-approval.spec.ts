import { BadRequestException } from '@nestjs/common';
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
import { OBJECT_STORAGE } from '../../catalog/media/object-storage';
import { User } from '../../users/models/user.model';
import { UsersService } from '../../users/users.service';
import { Vendor } from '../../vendors/models/vendor.model';
import { AdminService } from '../admin.service';

// Decision 0056 §3b: the generic users-page approve/reject must keep an
// ustaad's two flags (users.is_approved, artisans.is_verified) in step.
describe('AdminService ustaad approval from the users page (integration)', () => {
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
          models: ARTISAN_TEST_MODELS,
        }),
        SequelizeModule.forFeature([
          User,
          Vendor,
          Artisan,
          ArtisanAccountDetails,
          ArtisanTeamMember,
          ArtisanHireRequest,
        ]),
      ],
      providers: [
        AdminService,
        ArtisansService,
        UsersService,
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
      name: `Ustaad approval ${Date.now()}`,
      phone: `6${Date.now()}`.slice(0, 10),
      role: Role.ARTISAN,
      isActive: true,
    } as never);
    userId = user.id;
  });

  afterEach(async () => {
    await Artisan.destroy({ where: { userId } });
    await User.destroy({ where: { id: userId } });
  });

  async function profile(document: boolean) {
    return Artisan.create({
      userId,
      tradeType: 'PLUMBER',
      documentUrl: document ? `artisans/${userId}/doc.pdf` : null,
    } as never);
  }

  async function flags() {
    const user = await User.findByPk(userId);
    const artisan = await Artisan.findOne({ where: { userId } });
    return { isApproved: user!.isApproved, isVerified: artisan?.isVerified ?? null };
  }

  it('approving an ustaad with a document verifies them too', async () => {
    await profile(true);

    await admin.approveUser(userId, 'admin-1');

    expect(await flags()).toEqual({ isApproved: true, isVerified: true });
  });

  it('approving an ustaad with no document fails and changes nothing', async () => {
    await profile(false);

    await expect(admin.approveUser(userId, 'admin-1')).rejects.toThrow(BadRequestException);

    expect(await flags()).toEqual({ isApproved: false, isVerified: false });
  });

  it('approving an ustaad with no profile fails and changes nothing', async () => {
    await expect(admin.approveUser(userId, 'admin-1')).rejects.toThrow(/has not created a profile/);

    expect(await flags()).toEqual({ isApproved: false, isVerified: null });
  });

  it('rejecting an ustaad clears both flags', async () => {
    const artisan = await profile(true);
    await artisan.update({ isVerified: true });
    await User.update({ isApproved: true }, { where: { id: userId } });

    await admin.rejectUser(userId, 'admin-1', 'fake documents');

    expect(await flags()).toEqual({ isApproved: false, isVerified: false });
  });

  it('rejecting an ustaad with no profile clears approval only', async () => {
    await User.update({ isApproved: true }, { where: { id: userId } });

    await admin.rejectUser(userId, 'admin-1');

    expect(await flags()).toEqual({ isApproved: false, isVerified: null });
  });

  it('dashboard counts ustaads waiting for a document', async () => {
    const before = (await admin.getDashboardStats()).artisansAwaitingDocument;
    await profile(false);

    expect((await admin.getDashboardStats()).artisansAwaitingDocument).toBe(before);
    // This user was already counted (no profile); with a document they drop out.
    await Artisan.update({ documentUrl: `artisans/${userId}/doc.pdf` }, { where: { userId } });
    expect((await admin.getDashboardStats()).artisansAwaitingDocument).toBe(before - 1);
  });
});
