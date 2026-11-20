import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, QueryTypes, UniqueConstraintError, WhereOptions } from 'sequelize';
import type { BrandDto, PaginatedResponse } from '@golden-abode/types';

import { Brand } from './models/brand.model';
import { BrandAlias } from './models/brand-alias.model';
import { BrandResolverService } from './brand-resolver.service';
import { CreateBrandDto } from './dto/create-brand.dto';
import { ListBrandsQueryDto } from './dto/list-brands-query.dto';

// Decision 0063: brands are created and maintained from the admin panel
// instead of seed scripts. Duplicate detection is the same
// normalize_brand_name() rule as the unique index on brand, checked first so
// the admin gets a message naming the existing brand rather than a raw
// constraint error.
@Injectable()
export class AdminBrandsService {
  constructor(
    @InjectModel(Brand)
    private readonly brandModel: typeof Brand,
    @InjectModel(BrandAlias)
    private readonly brandAliasModel: typeof BrandAlias,
    private readonly brandResolver: BrandResolverService,
  ) {}

  private get sequelize() {
    return this.brandModel.sequelize!;
  }

  async list(query: ListBrandsQueryDto): Promise<PaginatedResponse<BrandDto>> {
    const limit = Math.min(query.limit ?? 25, 100);
    const page = query.page ?? 1;

    const conditions: WhereOptions[] = [];
    if (query.isActive !== undefined) conditions.push({ isActive: query.isActive });
    const search = query.search?.trim();
    if (search) {
      const pattern = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      const aliasHits = await this.brandAliasModel.findAll({
        attributes: ['brandId'],
        where: { alias: { [Op.iLike]: pattern } },
      });
      conditions.push({
        [Op.or]: [{ name: { [Op.iLike]: pattern } }, { id: aliasHits.map((a) => a.brandId) }],
      });
    }

    const { rows, count } = await this.brandModel.findAndCountAll({
      where: conditions.length ? { [Op.and]: conditions } : {},
      order: [['name', 'ASC']],
      limit,
      offset: (page - 1) * limit,
    });

    return {
      items: await this.toDtos(rows),
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit),
    };
  }

  async get(id: string): Promise<BrandDto> {
    const brand = await this.brandModel.findByPk(id);
    if (!brand) throw new NotFoundException('Brand not found');
    const [dto] = await this.toDtos([brand]);
    return dto;
  }

  async create(dto: CreateBrandDto): Promise<BrandDto> {
    await this.assertNameFree(dto.name);
    const slug = await this.uniqueSlug(dto.name);

    try {
      const brand = await this.brandModel.create({
        name: dto.name,
        slug,
        manufacturerName: dto.manufacturerName,
        manufacturerAddress: dto.manufacturerAddress,
        consumerCareEmail: dto.consumerCareEmail,
        consumerCarePhone: dto.consumerCarePhone,
        isActive: true,
      } as never);
      return this.get(brand.id);
    } catch (err) {
      // Another admin created the same brand between the check and the insert.
      if (err instanceof UniqueConstraintError) {
        throw new ConflictException(`brand "${dto.name}" already exists`);
      }
      throw err;
    }
  }

  // Same name (after normalize_brand_name) as another brand, or the exact
  // text of another brand's alias. The second matters because the resolver
  // checks aliases first: a brand named like someone else's alias could never
  // be found by its own name. `exceptId` lets a rename keep its own name.
  private async assertNameFree(name: string, exceptId?: string): Promise<void> {
    const clash = await this.sequelize.query<{ name: string }>(
      `SELECT name FROM brand
        WHERE normalize_brand_name(name) = normalize_brand_name(:name)
          AND (:exceptId::uuid IS NULL OR id <> :exceptId::uuid)
        LIMIT 1`,
      { replacements: { name, exceptId: exceptId ?? null }, type: QueryTypes.SELECT },
    );
    if (clash.length > 0) {
      throw new ConflictException(`brand "${clash[0].name}" already exists`);
    }

    const alias = await this.brandAliasModel.findOne({
      where: { alias: name.trim().toLowerCase().replace(/\s+/g, ' ') },
      include: [Brand],
    });
    if (alias && alias.brandId !== exceptId) {
      throw new ConflictException(
        `"${name}" is already an alias of brand "${alias.brand?.name ?? alias.brandId}"`,
      );
    }
  }

  private async uniqueSlug(name: string): Promise<string> {
    const base =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 150) || 'brand';
    const taken = new Set(
      (
        await this.brandModel.findAll({
          attributes: ['slug'],
          where: { slug: { [Op.or]: [base, { [Op.like]: `${base}-%` }] } },
        })
      ).map((b) => b.slug),
    );
    if (!taken.has(base)) return base;
    for (let n = 2; ; n++) {
      if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
    }
  }

  private async toDtos(brands: Brand[]): Promise<BrandDto[]> {
    if (brands.length === 0) return [];
    const ids = brands.map((b) => b.id);

    const counts = await this.sequelize.query<{ brand_id: string; count: string }>(
      `SELECT brand_id, count(*) AS count FROM master_product WHERE brand_id IN (:ids) GROUP BY brand_id`,
      { replacements: { ids }, type: QueryTypes.SELECT },
    );
    const countById = new Map(counts.map((c) => [c.brand_id, Number(c.count)]));

    const aliases = await this.brandAliasModel.findAll({
      where: { brandId: ids },
      order: [['alias', 'ASC']],
    });
    const aliasesById = new Map<string, string[]>();
    for (const a of aliases) {
      aliasesById.set(a.brandId, [...(aliasesById.get(a.brandId) ?? []), a.alias]);
    }

    return brands.map((b) => ({
      id: b.id,
      name: b.name,
      slug: b.slug,
      logoUrl: b.logoUrl,
      manufacturerName: b.manufacturerName,
      manufacturerAddress: b.manufacturerAddress,
      consumerCareEmail: b.consumerCareEmail,
      consumerCarePhone: b.consumerCarePhone,
      isActive: b.isActive,
      mergedIntoId: b.mergedIntoId,
      productCount: countById.get(b.id) ?? 0,
      aliases: aliasesById.get(b.id) ?? [],
    }));
  }
}
