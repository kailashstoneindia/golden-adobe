import { SequelizeModule } from '@nestjs/sequelize';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@golden-abode/types';

import { ARTISAN_TEST_MODELS } from '../../artisans/__tests__/test-db';
import { User } from '../../users/models/user.model';
import { Artisan } from '../../artisans/models/artisan.model';
import { ArtisanHireRequest } from '../../artisans/models/artisan-hire-request.model';
import { AdminService } from '../admin.service';

describe('AdminService artisan surfacing (integration)', () => {
  let moduleRef: TestingModule;
  let adminService: AdminService;
  const suffix = Math.random().toString(36).slice(2, 10);
  let artisanUserId: string;
  let customerUserId: string;

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
        SequelizeModule.forFeature([User, ArtisanHireRequest]),
      ],
      providers: [AdminService],
    }).compile();

    adminService = moduleRef.get(AdminService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    const artisanUser = await User.create({
      name: `Admin Artisan Surfacing Test ${suffix}`,
      phone: `9${suffix}`.slice(0, 10),
      role: Role.ARTISAN,
      isActive: true,
    } as never);
    artisanUserId = artisanUser.id;

    const customerUser = await User.create({
      name: `Admin Artisan Surfacing Customer ${suffix}`,
      phone: `8${suffix}`.slice(0, 10),
      role: Role.CUSTOMER,
      isActive: true,
    } as never);
    customerUserId = customerUser.id;
  });

  afterEach(async () => {
    const artisan = await Artisan.findOne({ where: { userId: artisanUserId } });
    if (artisan) {
      await ArtisanHireRequest.destroy({ where: { artisanId: artisan.id } });
      await artisan.destroy();
    }
    await User.destroy({ where: { id: [artisanUserId, customerUserId] } });
  });

  it('includes artisan profile data in getUserById for an artisan user', async () => {
    await Artisan.create({
      userId: artisanUserId,
      tradeType: 'PLUMBER',
      isVerified: true,
    } as never);

    const dto = await adminService.getUserById(artisanUserId);
    expect(dto.artisan).toMatchObject({ tradeType: 'PLUMBER', isVerified: true });
  });

  it('counts pending artisan verifications and pending hire requests separately from pendingArtisans', async () => {
    const artisan = await Artisan.create({
      userId: artisanUserId,
      tradeType: 'PLUMBER',
      isVerified: false,
      documentUrl: 'artisans/x/doc.pdf',
    } as never);

    await ArtisanHireRequest.create({
      customerId: customerUserId,
      artisanId: artisan.id,
      addressText: '1 Park Lane',
      status: 'PENDING_ADMIN_REVIEW',
    } as never);

    const stats = await adminService.getDashboardStats();
    expect(stats.pendingArtisanVerifications).toBeGreaterThanOrEqual(1);
    expect(stats.pendingHireRequests).toBeGreaterThanOrEqual(1);
  });
});
