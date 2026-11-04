import { SequelizeModule } from '@nestjs/sequelize';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@golden-abode/types';
import { Op } from 'sequelize';

import { ARTISAN_TEST_MODELS } from '../../artisans/__tests__/test-db';
import { Artisan } from '../../artisans/models/artisan.model';
import { User } from '../models/user.model';
import { UsersService } from '../users.service';

// Decision 0056 §3a: ustaads who cannot be verified yet because there is no
// profile or no document. The admin needs them listed to chase them.
describe('UsersService ustaads awaiting a document (integration)', () => {
  let moduleRef: TestingModule;
  let service: UsersService;
  const tag = `awaitdoc-${Math.random().toString(36).slice(2, 8)}`;
  const ids: Record<string, string> = {};

  async function ustaad(
    key: string,
    opts: { profile?: boolean; document?: boolean; active?: boolean },
  ) {
    const user = await User.create({
      name: `${tag} ${key}`,
      phone: `7${Math.floor(Math.random() * 1e9)}`.padEnd(10, '0').slice(0, 10),
      email: `${tag}-${key}@test.local`,
      role: Role.ARTISAN,
      isActive: opts.active ?? true,
    } as never);
    ids[key] = user.id;
    if (opts.profile) {
      await Artisan.create({
        userId: user.id,
        tradeType: 'PLUMBER',
        servicePincode: '560001',
        documentUrl: opts.document ? `artisans/${user.id}/doc.pdf` : null,
      } as never);
    }
  }

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
        SequelizeModule.forFeature([User]),
      ],
      providers: [UsersService],
    }).compile();
    service = moduleRef.get(UsersService);

    await ustaad('noProfile', {});
    await ustaad('noDocument', { profile: true });
    await ustaad('withDocument', { profile: true, document: true });
    await ustaad('inactive', { active: false });
  });

  afterAll(async () => {
    const userIds = Object.values(ids);
    await Artisan.destroy({ where: { userId: { [Op.in]: userIds } } });
    await User.destroy({ where: { id: { [Op.in]: userIds } } });
    await moduleRef.close();
  });

  async function listedKeys() {
    const page = await service.listArtisansAwaitingDocument(1, 100);
    return Object.keys(ids).filter((key) => page.items.some((item) => item.userId === ids[key]));
  }

  it('lists active ustaads with no profile or no document', async () => {
    expect((await listedKeys()).sort()).toEqual(['noDocument', 'noProfile']);
  });

  it('says whether a profile exists and carries contact details', async () => {
    const page = await service.listArtisansAwaitingDocument(1, 100);
    const noDoc = page.items.find((item) => item.userId === ids.noDocument)!;
    const noProfile = page.items.find((item) => item.userId === ids.noProfile)!;

    expect(noDoc).toMatchObject({
      hasProfile: true,
      tradeType: 'PLUMBER',
      servicePincode: '560001',
    });
    expect(noDoc.email).toBe(`${tag}-noDocument@test.local`);
    expect(noProfile).toMatchObject({ hasProfile: false, tradeType: null });
    expect(noProfile.phone).toMatch(/^7\d{9}$/);
  });

  it('count agrees with the list', async () => {
    const page = await service.listArtisansAwaitingDocument(1, 1000);
    expect(await service.countArtisansAwaitingDocument()).toBe(page.total);
  });
});
