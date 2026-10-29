import { NotFoundException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SequelizeModule } from '@nestjs/sequelize';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@golden-abode/types';

import { ARTISAN_TEST_MODELS } from './test-db';
import { User } from '../../users/models/user.model';
import { Artisan } from '../models/artisan.model';
import { ArtisanAccountDetails } from '../models/artisan-account-details.model';
import { ArtisanTeamMember } from '../models/artisan-team-member.model';
import { ArtisansService } from '../artisans.service';
import { loadStorageConfig } from '../../../config/storage.config';
import { MEDIA_STORAGE_CONFIG, OBJECT_STORAGE } from '../../catalog/media/object-storage';
import { S3ObjectStorage } from '../../catalog/media/s3-object-storage.service';

describe('ArtisansService (integration)', () => {
  let moduleRef: TestingModule;
  let service: ArtisansService;
  const suffix = `t${Date.now()}`;
  let userId: string;

  beforeAll(async () => {
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
          models: ARTISAN_TEST_MODELS,
        }),
        SequelizeModule.forFeature([Artisan, ArtisanAccountDetails, ArtisanTeamMember]),
      ],
      providers: [
        ArtisansService,
        {
          provide: MEDIA_STORAGE_CONFIG,
          useFactory: () => loadStorageConfig(),
        },
        {
          provide: OBJECT_STORAGE,
          inject: [MEDIA_STORAGE_CONFIG],
          useFactory: (config: ReturnType<typeof loadStorageConfig>) =>
            new S3ObjectStorage(config),
        },
      ],
    }).compile();

    service = moduleRef.get(ArtisansService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    const user = await User.create({
      name: `Artisan Service Test ${suffix}-${Date.now()}`,
      phone: `9${Date.now()}`.slice(0, 10),
      role: Role.ARTISAN,
      isActive: true,
    } as never);
    userId = user.id;
  });

  afterEach(async () => {
    await Artisan.destroy({ where: { userId } });
    await User.destroy({ where: { id: userId } });
  });

  it('creates a team member with only a name and nothing else', async () => {
    await service.onboardProfile(userId, { tradeType: 'PLUMBER' });
    const member = await service.addTeamMember(userId, { name: 'Ramesh' });
    expect(member.roleOnTeam).toBeNull();
    expect(member.phone).toBeNull();
    expect(member.documentUrl).toBeNull();
  });

  it('throws NotFoundException for an unverified artisan', async () => {
    const artisan = await service.onboardProfile(userId, { tradeType: 'PLUMBER' });
    await expect(service.getPublicProfile(artisan.id)).rejects.toThrow(NotFoundException);
  });

  it('returns the bio-only profile for a verified artisan', async () => {
    const artisan = await service.onboardProfile(userId, {
      tradeType: 'PLUMBER',
      bio: 'Ten years tiling.',
    });
    await Artisan.update(
      { isVerified: true, documentUrl: 'artisans/x/doc.pdf' },
      { where: { id: artisan.id } },
    );
    const dto = await service.getPublicProfile(artisan.id);
    expect(dto.bio).toBe('Ten years tiling.');
    expect(dto).not.toHaveProperty('documentUrl');
  });

  it('sets documentUrl only after confirmDocumentUpload is called', async () => {
    const profile = await service.onboardProfile(userId, { tradeType: 'PLUMBER' });
    expect(profile.documentUrl).toBeNull();
    const confirmed = await service.confirmDocumentUpload(userId, `artisans/${profile.id}/doc-key.pdf`);
    expect(confirmed.documentUrl).toContain('doc-key.pdf');
  });

  it('rejects confirmDocumentUpload for a key outside this artisan own prefix', async () => {
    await service.onboardProfile(userId, { tradeType: 'PLUMBER' });
    await expect(
      service.confirmDocumentUpload(userId, 'artisans/someone-else/doc-key.pdf'),
    ).rejects.toThrow();
  });

  it('cannot verify an artisan with no uploaded document', async () => {
    const profile = await service.onboardProfile(userId, { tradeType: 'PLUMBER' });
    await expect(service.verify(profile.id)).rejects.toThrow();
  });
});
