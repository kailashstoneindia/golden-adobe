import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Brand } from './models/brand.model';
import { BrandAlias } from './models/brand-alias.model';

// Phase 7, risk 1 (catalog-integrity-residual-risks.md) — the single place
// that turns a TYPED brand string into a canonical Brand row. Every
// consumer that used to do Brand.findOne({ where: { name: ... } }) or an
// ILIKE match directly (VendorMatchLadderService, CatalogImportUploadService,
// VendorCatalogImportService) should resolve through here instead, so the
// alias table and normalized-name matching actually protect every entry
// point, not just whichever one remembered to check.
//
// Resolution order:
//   1. brand_alias exact match — the common case once a few aliases exist
//   2. normalize_brand_name() match against brand.name itself — catches
//      "HAVELLS" / "havells" / "Havells Ltd" without an alias row existing
//      yet
//   3. not found — caller decides what to do (reject the row, flag for
//      admin brand creation); this service NEVER creates a brand.
@Injectable()
export class BrandResolverService {
  private static readonly MAX_MERGE_HOPS = 5;
  private readonly logger = new Logger(BrandResolverService.name);

  constructor(
    @InjectModel(Brand)
    private readonly brandModel: typeof Brand,
    @InjectModel(BrandAlias)
    private readonly brandAliasModel: typeof BrandAlias,
    private readonly sequelize: Sequelize,
  ) {}

  async resolve(typedName: string): Promise<Brand | null> {
    const matched = await this.matchTypedName(typedName);
    return matched ? this.followMerges(matched) : null;
  }

  // A merged brand keeps its row (deactivated, merged_into_id set) so its
  // old name and aliases still match; the caller must get the brand that
  // survived the merge (decision 0063). Merges can chain, so walk the
  // pointer, capped so a corrupt cycle can't loop forever.
  private async followMerges(start: Brand): Promise<Brand | null> {
    let current = start;
    for (let hop = 0; hop < BrandResolverService.MAX_MERGE_HOPS; hop++) {
      if (!current.mergedIntoId) return current;
      const next = await this.brandModel.findByPk(current.mergedIntoId);
      if (!next) return null;
      current = next;
    }
    if (!current.mergedIntoId) return current;
    this.logger.error(
      `brand ${start.id} ("${start.name}") did not reach a final brand within ${BrandResolverService.MAX_MERGE_HOPS} merge hops — merge cycle or chain too long`,
    );
    return null;
  }

  private async matchTypedName(typedName: string): Promise<Brand | null> {
    const normalized = this.normalizeLoosely(typedName);
    if (!normalized) return null;

    const alias = await this.brandAliasModel.findOne({
      where: { alias: normalized },
      include: [Brand],
    });
    if (alias?.brand) return alias.brand;

    // normalize_brand_name() is a SQL function (strips corporate suffixes
    // too, not just case/whitespace) — deliberately delegated to Postgres
    // rather than reimplemented in JS, so the index this migration created
    // and this lookup can never drift apart.
    const rows = await this.sequelize.query<{ id: string }>(
      `SELECT id FROM brand WHERE normalize_brand_name(name) = normalize_brand_name(:typedName) LIMIT 1`,
      { replacements: { typedName }, type: QueryTypes.SELECT },
    );
    if (rows.length > 0) {
      return this.brandModel.findByPk(rows[0].id);
    }

    return null;
  }

  // Teaches the resolver — called when an admin confirms "this typed text
  // means this brand" (e.g. resolving a review-queue row, or explicitly
  // adding a known alternate spelling). Mirrors how stone_variety_alias is
  // grown: every manual resolution should teach the matcher, not just fix
  // the one row in front of it.
  async addAlias(brandId: string, aliasText: string): Promise<void> {
    const normalized = this.normalizeLoosely(aliasText);
    if (!normalized) return;
    await this.brandAliasModel.upsert({ brandId, alias: normalized } as never);
  }

  async listAliases(brandId: string): Promise<BrandAlias[]> {
    return this.brandAliasModel.findAll({ where: { brandId }, order: [['alias', 'ASC']] });
  }

  // Scoped to the brand so a stale or tampered alias id can't remove another
  // brand's alias through this brand's endpoint.
  async removeAlias(brandId: string, aliasId: string): Promise<void> {
    const removed = await this.brandAliasModel.destroy({ where: { id: aliasId, brandId } });
    if (removed === 0) {
      throw new NotFoundException(`alias ${aliasId} not found on brand ${brandId}`);
    }
  }

  // Light JS-side normalisation for the alias table lookup only (lowercase
  // + trim) — the alias table stores exactly what was taught, so matching
  // it doesn't need the SQL function's suffix-stripping; only the
  // brand.name comparison in step 2 does, and that runs in Postgres
  // deliberately (see above).
  private normalizeLoosely(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
  }
}
