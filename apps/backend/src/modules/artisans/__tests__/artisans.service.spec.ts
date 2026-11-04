import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SequelizeModule } from '@nestjs/sequelize';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@golden-abode/types';

import { ARTISAN_TEST_MODELS } from './test-db';
import { FakeObjectStorage } from './fake-object-storage';
import { User } from '../../users/models/user.model';
import { Artisan } from '../models/artisan.model';
import { ArtisanAccountDetails } from '../models/artisan-account-details.model';
import { ArtisanTeamMember } from '../models/artisan-team-member.model';
import { ArtisansService } from '../artisans.service';
import { loadStorageConfig } from '../../../config/storage.config';
import { MEDIA_STORAGE_CONFIG, OBJECT_STORAGE } from '../../catalog/media/object-storage';

describe('ArtisansService (integration)', () => {
  let moduleRef: TestingModule;
  let service: ArtisansService;
  let fakeStorage: FakeObjectStorage;
  const suffix = `t${Date.now()}`;
  let userId: string;

  beforeAll(async () => {
    fakeStorage = new FakeObjectStorage();

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
        SequelizeModule.forFeature([Artisan, ArtisanAccountDetails, ArtisanTeamMember, User]),
      ],
      providers: [
        ArtisansService,
        {
          provide: MEDIA_STORAGE_CONFIG,
          useFactory: () => loadStorageConfig(),
        },
        { provide: OBJECT_STORAGE, useValue: fakeStorage },
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
    await service.onboardProfile(userId, { tradeType: 'PLUMBER', servicePincode: '560001' });
    const member = await service.addTeamMember(userId, { name: 'Ramesh' });
    expect(member.roleOnTeam).toBeNull();
    expect(member.phone).toBeNull();
    expect(member.documentUrl).toBeNull();
  });

  it('throws NotFoundException for an unverified artisan', async () => {
    const artisan = await service.onboardProfile(userId, {
      tradeType: 'PLUMBER',
      servicePincode: '560001',
    });
    await expect(service.getPublicProfile(artisan.id)).rejects.toThrow(NotFoundException);
  });

  it('returns the bio-only profile for a verified artisan', async () => {
    const artisan = await service.onboardProfile(userId, {
      tradeType: 'PLUMBER',
      servicePincode: '560001',
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
    const profile = await service.onboardProfile(userId, {
      tradeType: 'PLUMBER',
      servicePincode: '560001',
    });
    expect(profile.documentUrl).toBeNull();
    const key = `artisans/${profile.id}/doc-key.pdf`;
    fakeStorage.seed(key);
    const confirmed = await service.confirmDocumentUpload(userId, key);
    expect(confirmed.documentUrl).toContain('doc-key.pdf');
  });

  it('createUploadUrl mints a key under the artisan own prefix by default (lead KYC doc)', async () => {
    const profile = await service.onboardProfile(userId, {
      tradeType: 'PLUMBER',
      servicePincode: '560001',
    });
    const presignSpy = jest.spyOn(fakeStorage, 'presignPost');

    await service.createUploadUrl(userId, 'application/pdf');

    expect(presignSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        key: expect.stringMatching(new RegExp(`^artisans/${profile.id}/doc-`)),
      }),
    );
    presignSpy.mockRestore();
  });

  it('createUploadUrl mints a key under the team/ sub-path when purpose is team_member', async () => {
    const profile = await service.onboardProfile(userId, {
      tradeType: 'PLUMBER',
      servicePincode: '560001',
    });
    const presignSpy = jest.spyOn(fakeStorage, 'presignPost');

    await service.createUploadUrl(userId, 'application/pdf', 'team_member');

    expect(presignSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        key: expect.stringMatching(new RegExp(`^artisans/${profile.id}/team/doc-`)),
      }),
    );
    presignSpy.mockRestore();
  });

  it('a team_member-purpose key passes the existing team member ownership-prefix check', async () => {
    const profile = await service.onboardProfile(userId, {
      tradeType: 'PLUMBER',
      servicePincode: '560001',
    });
    const key = `artisans/${profile.id}/team/doc-e2e-test.pdf`;

    const member = await service.addTeamMember(userId, { name: 'Suresh', documentUrl: key });
    expect(member.documentUrl).toBe(key);
  });

  describe('searchPublic', () => {
    it('only returns verified artisans', async () => {
      const artisan = await service.onboardProfile(userId, {
        tradeType: 'PLUMBER',
        servicePincode: '560001',
      });
      const page = await service.searchPublic(1, 20, {});
      expect(page.items.some((a) => a.id === artisan.id)).toBe(false);

      await Artisan.update({ isVerified: true }, { where: { id: artisan.id } });
      const pageAfterVerify = await service.searchPublic(1, 20, {});
      expect(pageAfterVerify.items.some((a) => a.id === artisan.id)).toBe(true);
    });

    it('filters by tradeType', async () => {
      const plumber = await service.onboardProfile(userId, {
        tradeType: 'PLUMBER',
        servicePincode: '560001',
      });
      await Artisan.update({ isVerified: true }, { where: { id: plumber.id } });

      const electricianUser = await User.create({
        name: `Search Electrician ${suffix}-${Date.now()}`,
        phone: `8${Date.now()}`.slice(0, 10),
        role: Role.ARTISAN,
        isActive: true,
      } as never);
      const electrician = await service.onboardProfile(electricianUser.id, {
        tradeType: 'ELECTRICIAN',
        servicePincode: '560001',
      });
      await Artisan.update({ isVerified: true }, { where: { id: electrician.id } });

      const page = await service.searchPublic(1, 20, { tradeType: 'ELECTRICIAN' });
      expect(page.items.every((a) => a.tradeType === 'ELECTRICIAN')).toBe(true);
      expect(page.items.some((a) => a.id === electrician.id)).toBe(true);
      expect(page.items.some((a) => a.id === plumber.id)).toBe(false);

      await Artisan.destroy({ where: { id: electrician.id } });
      await User.destroy({ where: { id: electricianUser.id } });
    });

    it('filters by exact pincode match', async () => {
      const artisan = await service.onboardProfile(userId, {
        tradeType: 'PLUMBER',
        servicePincode: '560001',
      });
      await Artisan.update({ isVerified: true }, { where: { id: artisan.id } });

      const matching = await service.searchPublic(1, 20, { pincode: '560001' });
      expect(matching.items.some((a) => a.id === artisan.id)).toBe(true);

      const nonMatching = await service.searchPublic(1, 20, { pincode: '560002' });
      expect(nonMatching.items.some((a) => a.id === artisan.id)).toBe(false);
    });

    it('combines tradeType and pincode filters', async () => {
      const artisan = await service.onboardProfile(userId, {
        tradeType: 'MASON',
        servicePincode: '110001',
      });
      await Artisan.update({ isVerified: true }, { where: { id: artisan.id } });

      const match = await service.searchPublic(1, 20, { tradeType: 'MASON', pincode: '110001' });
      expect(match.items.some((a) => a.id === artisan.id)).toBe(true);

      const wrongPincode = await service.searchPublic(1, 20, {
        tradeType: 'MASON',
        pincode: '110002',
      });
      expect(wrongPincode.items.some((a) => a.id === artisan.id)).toBe(false);
    });

    it('returns ArtisanPublicProfileDto shape only — never phone, documents, or account details', async () => {
      const artisan = await service.onboardProfile(userId, {
        tradeType: 'PLUMBER',
        servicePincode: '560001',
      });
      await Artisan.update(
        { isVerified: true, documentUrl: 'artisans/x/doc.pdf' },
        { where: { id: artisan.id } },
      );

      const page = await service.searchPublic(1, 20, { tradeType: 'PLUMBER' });
      const found = page.items.find((a) => a.id === artisan.id);
      expect(found).not.toHaveProperty('documentUrl');
      expect(found).not.toHaveProperty('servicePincode');
      expect(found).not.toHaveProperty('accountDetails');
    });
  });

  it('rejects confirmDocumentUpload for a key outside this artisan own prefix', async () => {
    await service.onboardProfile(userId, { tradeType: 'PLUMBER', servicePincode: '560001' });
    await expect(
      service.confirmDocumentUpload(userId, 'artisans/someone-else/doc-key.pdf'),
    ).rejects.toThrow();
  });

  it('rejects confirmDocumentUpload when the key was never actually uploaded', async () => {
    const profile = await service.onboardProfile(userId, {
      tradeType: 'PLUMBER',
      servicePincode: '560001',
    });
    const key = `artisans/${profile.id}/doc-never-uploaded.pdf`;
    await expect(service.confirmDocumentUpload(userId, key)).rejects.toThrow();
    const unchanged = await service.getOwnProfile(userId);
    expect(unchanged.documentUrl).toBeNull();
  });

  it('cannot verify an artisan with no uploaded document', async () => {
    const profile = await service.onboardProfile(userId, {
      tradeType: 'PLUMBER',
      servicePincode: '560001',
    });
    await expect(service.verify(profile.id)).rejects.toThrow();
  });

  it('rejectVerification clears isVerified regardless of whether a reason was given', async () => {
    const profile = await service.onboardProfile(userId, {
      tradeType: 'PLUMBER',
      servicePincode: '560001',
    });
    const key = `artisans/${profile.id}/doc-key.pdf`;
    fakeStorage.seed(key);
    await service.confirmDocumentUpload(userId, key);
    await service.verify(profile.id);

    const rejected = await service.rejectVerification(profile.id, 'Document is blurry');
    expect(rejected.isVerified).toBe(false);
  });

  describe('verification sets the account approval too (decision 0056)', () => {
    async function profileWithDocument() {
      const profile = await service.onboardProfile(userId, {
        tradeType: 'PLUMBER',
        servicePincode: '560001',
      });
      const key = `artisans/${profile.id}/doc-key.pdf`;
      fakeStorage.seed(key);
      await service.confirmDocumentUpload(userId, key);
      return profile;
    }

    async function flags(artisanId: string) {
      const artisan = await Artisan.findByPk(artisanId);
      const user = await User.findByPk(userId);
      return { isVerified: artisan!.isVerified, isApproved: user!.isApproved };
    }

    it('verify sets artisan.isVerified and user.isApproved', async () => {
      const profile = await profileWithDocument();

      await service.verify(profile.id);

      expect(await flags(profile.id)).toEqual({ isVerified: true, isApproved: true });
    });

    it('verify without a document changes neither flag', async () => {
      const profile = await service.onboardProfile(userId, {
        tradeType: 'PLUMBER',
        servicePincode: '560001',
      });

      await expect(service.verify(profile.id)).rejects.toThrow(BadRequestException);

      expect(await flags(profile.id)).toEqual({ isVerified: false, isApproved: false });
    });

    it('rejectVerification clears both flags', async () => {
      const profile = await profileWithDocument();
      await Artisan.update({ isVerified: true }, { where: { id: profile.id } });
      await User.update({ isApproved: true }, { where: { id: userId } });

      await service.rejectVerification(profile.id, 'Document is blurry');

      expect(await flags(profile.id)).toEqual({ isVerified: false, isApproved: false });
    });

    it('verify rolls back when the user update fails', async () => {
      const profile = await profileWithDocument();
      const spy = jest.spyOn(User, 'update').mockRejectedValueOnce(new Error('db down'));

      await expect(service.verify(profile.id)).rejects.toThrow('db down');
      spy.mockRestore();

      expect(await flags(profile.id)).toEqual({ isVerified: false, isApproved: false });
    });
  });

  it('listPendingVerification excludes artisans with no uploaded document', async () => {
    await service.onboardProfile(userId, { tradeType: 'PLUMBER', servicePincode: '560001' });
    const page = await service.listPendingVerification(1, 20);
    expect(page.items.find((artisan) => artisan.userId === userId)).toBeUndefined();
  });

  it('listPendingVerification includes a document-backed, unverified artisan and paginates', async () => {
    const profile = await service.onboardProfile(userId, {
      tradeType: 'PLUMBER',
      servicePincode: '560001',
    });
    const key = `artisans/${profile.id}/doc-key.pdf`;
    fakeStorage.seed(key);
    await service.confirmDocumentUpload(userId, key);

    const page = await service.listPendingVerification(1, 20);
    expect(page.items.some((artisan) => artisan.id === profile.id)).toBe(true);
    expect(page.page).toBe(1);
    expect(page.limit).toBe(20);
    expect(page.total).toBeGreaterThanOrEqual(1);
  });

  it('listArtisans returns a paginated page, newest first', async () => {
    await service.onboardProfile(userId, { tradeType: 'ELECTRICIAN', servicePincode: '560001' });
    const page = await service.listArtisans(1, 20);
    expect(page.items.some((artisan) => artisan.userId === userId)).toBe(true);
    expect(page.page).toBe(1);
    expect(page.limit).toBe(20);
  });
});
