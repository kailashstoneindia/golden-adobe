import { TestingModule, Test } from '@nestjs/testing';
import { SequelizeModule } from '@nestjs/sequelize';
import { Role } from '@golden-abode/types';

import { ARTISAN_TEST_MODELS } from './test-db';
import { User } from '../../users/models/user.model';
import { Artisan } from '../models/artisan.model';
import { ArtisanAccountDetails } from '../models/artisan-account-details.model';
import { ArtisanTeamMember } from '../models/artisan-team-member.model';
import { ArtisanHireRequest } from '../models/artisan-hire-request.model';
import { ArtisanCompletionEstimate } from '../models/artisan-completion-estimate.model';

describe('Artisan models (integration)', () => {
  let moduleRef: TestingModule;
  const suffix = `t${Date.now()}`;
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
      ],
    }).compile();

    const artisanUser = await User.create({
      name: `Artisan Model Test ${suffix}`,
      phone: `9${suffix}`.slice(0, 10),
      role: Role.ARTISAN,
      isActive: true,
    } as never);
    artisanUserId = artisanUser.id;

    const customerUser = await User.create({
      name: `Customer Model Test ${suffix}`,
      phone: `8${suffix}`.slice(0, 10),
      role: Role.CUSTOMER,
      isActive: true,
    } as never);
    customerUserId = customerUser.id;
  });

  afterAll(async () => {
    // artisan_hire_requests.customer_id has no onDelete cascade (LLD §2.4 —
    // a hire request should survive a customer account change), so the
    // customer_id's created here must be cleared explicitly before the
    // users row can be deleted; artisans cascades through its own FK and
    // takes account details/team/hire requests/estimates with it.
    await ArtisanHireRequest.destroy({ where: { customerId: customerUserId } });
    await Artisan.destroy({ where: { userId: artisanUserId } });
    await User.destroy({ where: { id: [artisanUserId, customerUserId] } });
    await moduleRef.close();
  });

  it('loads an artisan with account details, team, and hire requests via include', async () => {
    const artisan = await Artisan.create({
      userId: artisanUserId,
      tradeType: 'PLUMBER',
      bio: 'Reliable plumber.',
    } as never);

    await ArtisanAccountDetails.create({
      artisanId: artisan.id,
      accountHolderName: 'Ramesh Kumar',
      bankName: 'SBI',
      ifscCode: 'SBIN0001234',
      branchName: 'Koramangala',
      accountNumber: '1234567890',
    } as never);

    await ArtisanTeamMember.create({
      artisanId: artisan.id,
      name: 'Suresh',
    } as never);

    const hireRequest = await ArtisanHireRequest.create({
      customerId: customerUserId,
      artisanId: artisan.id,
      addressText: '12 MG Road, Bengaluru',
    } as never);

    await ArtisanCompletionEstimate.create({
      hireRequestId: hireRequest.id,
      estimatedDays: 5,
    } as never);

    const loaded = await Artisan.findByPk(artisan.id, {
      include: [
        ArtisanAccountDetails,
        ArtisanTeamMember,
        { model: ArtisanHireRequest, include: [ArtisanCompletionEstimate] },
      ],
    });

    expect(loaded).not.toBeNull();
    expect(loaded!.accountDetails).toBeDefined();
    expect(loaded!.accountDetails!.accountHolderName).toBe('Ramesh Kumar');
    expect(loaded!.team).toHaveLength(1);
    expect(loaded!.team![0].name).toBe('Suresh');
    expect(loaded!.hireRequests).toHaveLength(1);
    expect(loaded!.hireRequests![0].estimates).toHaveLength(1);
    expect(loaded!.hireRequests![0].estimates![0].estimatedDays).toBe(5);
  });
});
