import { Logger, NotFoundException } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Test, TestingModule } from '@nestjs/testing';

import { CATALOG_TEST_MODELS } from './test-db';
import { BrandResolverService } from '../brand-resolver.service';
import { Brand } from '../models/brand.model';
import { BrandAlias } from '../models/brand-alias.model';

// Decision 0063 / S1 Task 2. The test database carries seeded brands
// (including a real "Havells"), so every brand here gets a unique name and
// the "HAVELLS" / "havells ltd" cases are exercised against that name.
describe('BrandResolverService (integration)', () => {
  let moduleRef: TestingModule;
  let resolver: BrandResolverService;
  const suffix = `br${Date.now()}`;
  const created: string[] = [];

  const makeBrand = async (name: string) => {
    const brand = await Brand.create({
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      manufacturerName: 'Test',
      manufacturerAddress: 'Test',
      consumerCareEmail: 'care@test.com',
      consumerCarePhone: '+911234567890',
    } as never);
    created.push(brand.id);
    return brand;
  };

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
          models: CATALOG_TEST_MODELS,
        }),
        SequelizeModule.forFeature([Brand, BrandAlias]),
      ],
      providers: [BrandResolverService],
    }).compile();
    resolver = moduleRef.get(BrandResolverService);
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    await BrandAlias.destroy({ where: { brandId: created } });
    await Brand.update({ mergedIntoId: null } as never, { where: { id: created } });
    await Brand.destroy({ where: { id: created } });
    await moduleRef.close();
  });

  it('resolves the upper-case and "ltd" spellings to the same brand', async () => {
    const brand = await makeBrand(`Volton${suffix}`);

    expect((await resolver.resolve(`VOLTON${suffix.toUpperCase()}`))?.id).toBe(brand.id);
    expect((await resolver.resolve(`volton${suffix} ltd`))?.id).toBe(brand.id);
  });

  it('resolves a taught alias', async () => {
    const brand = await makeBrand(`Aliasco${suffix}`);
    await resolver.addAlias(brand.id, `AC Wires ${suffix}`);

    expect((await resolver.resolve(`ac wires ${suffix}`))?.id).toBe(brand.id);
  });

  it('follows merged_into_id to the brand that survived the merge', async () => {
    const target = await makeBrand(`Survivor${suffix}`);
    const middle = await makeBrand(`Middle${suffix}`);
    const source = await makeBrand(`Absorbed${suffix}`);
    await middle.update({ mergedIntoId: target.id, isActive: false } as never);
    await source.update({ mergedIntoId: middle.id, isActive: false } as never);

    expect((await resolver.resolve(`Absorbed${suffix}`))?.id).toBe(target.id);
  });

  it('follows a merge for a name reached through an alias too', async () => {
    const target = await makeBrand(`AliasTarget${suffix}`);
    const source = await makeBrand(`AliasSource${suffix}`);
    await resolver.addAlias(source.id, `old spelling ${suffix}`);
    await source.update({ mergedIntoId: target.id, isActive: false } as never);

    expect((await resolver.resolve(`Old Spelling ${suffix}`))?.id).toBe(target.id);
  });

  it('returns null and logs an error for a merge cycle', async () => {
    const a = await makeBrand(`CycleA${suffix}`);
    const b = await makeBrand(`CycleB${suffix}`);
    await a.update({ mergedIntoId: b.id } as never);
    await b.update({ mergedIntoId: a.id } as never);
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    expect(await resolver.resolve(`CycleA${suffix}`)).toBeNull();
    expect(error).toHaveBeenCalled();
  });

  it('lists and removes a brand alias', async () => {
    const brand = await makeBrand(`Listy${suffix}`);
    await resolver.addAlias(brand.id, `Listy One ${suffix}`);
    await resolver.addAlias(brand.id, `Listy Two ${suffix}`);

    const aliases = await resolver.listAliases(brand.id);
    expect(aliases.map((a) => a.alias).sort()).toEqual([
      `listy one ${suffix}`,
      `listy two ${suffix}`,
    ]);

    await resolver.removeAlias(brand.id, aliases[0].id);
    expect((await resolver.listAliases(brand.id)).map((a) => a.id)).toEqual([aliases[1].id]);
  });

  it('removeAlias refuses (404) an alias that belongs to another brand and keeps it', async () => {
    const owner = await makeBrand(`Owner${suffix}`);
    const other = await makeBrand(`Other${suffix}`);
    await resolver.addAlias(owner.id, `owned ${suffix}`);
    const [alias] = await resolver.listAliases(owner.id);

    await expect(resolver.removeAlias(other.id, alias.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(await resolver.listAliases(owner.id)).toHaveLength(1);
  });
});
