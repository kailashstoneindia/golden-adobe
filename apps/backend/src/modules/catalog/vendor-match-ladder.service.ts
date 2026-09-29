import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { VendorProductMap } from './models/vendor-product-map.model';
import { MasterProduct } from './models/master-product.model';
import { Category } from './models/category.model';
import { Attribute } from './models/attribute.model';
import { MasterProductAttributeValue } from './models/master-product-attribute-value.model';
import { StoneVarietyAlias } from './models/stone-variety-alias.model';
import { ImportMatchCandidate, ImportMatchMethod } from './models/catalog-import-row.model';
import { BrandResolverService } from './brand-resolver.service';

// A parsed vendor inventory row, in whatever units the upload service hands
// off — deliberately loose (not the full CatalogImportRow model) so this
// service can be unit-tested and called standalone, independent of the
// staging table.
export type VendorInventoryRow = {
  vendorId: string;
  productRef: string; // GTIN, MPN, product_code, plain name, or stone variety name — "anything the vendor already has" (decision 0011); used by steps 1-5
  // The vendor's OWN persistent code (their vendor_listing.vendor_sku),
  // when they have one — decision 0011: "vendor_sku was already stored but
  // never used as a key". This, NOT productRef, is what step 0 checks
  // against vendor_product_map and what a successful step 1-5 match gets
  // remembered under, because it is the thing a vendor actually reuses
  // upload to upload — productRef is just whatever text identified the
  // product THIS time (a barcode, an MPN, a plain name) and is not
  // guaranteed to repeat. Falls back to productRef when the vendor has no
  // SKU of their own to offer.
  vendorSku?: string;
  categoryId?: string; // known when the vendor's export was scoped to one leaf category; used by steps 4-5 to narrow the search
  brandName?: string;
  stoneVarietyName?: string; // stone only — matched via stone_variety_alias, not free-text against master_product
  attributeValues?: Record<string, string>; // attribute code -> raw value, used by step 4 (structured match)
};

export type MatchVerdict = {
  status: 'auto_matched' | 'needs_review';
  matchedMasterProductId: string | null;
  matchConfidence: number | null;
  matchMethod: ImportMatchMethod | null;
  candidates: ImportMatchCandidate[];
  // The key (row.vendorSku, falling back to row.productRef) a caller
  // should write to vendor_product_map on confirmation — resolved here
  // rather than left for every caller to recompute the same fallback.
  vendorMapKey: string;
};

// Minimum SIMILARITY score (pg_trgm) for a fuzzy match to appear as a
// candidate at all — below this, the name comparison is noise, not a
// plausible match.
const FUZZY_CANDIDATE_MIN_SIMILARITY = 0.3;
const FUZZY_CANDIDATE_LIMIT = 5;

// Step 4 (structured match) confidence threshold for AUTO-matching, as
// opposed to surfacing as a candidate. catalog-build-order.md flags this
// explicitly as an open question — "too low fragments the catalog, too
// high buries the admin in review" — not yet resolved by real upload data.
// Set conservatively at 1.0 (every variant-defining attribute must match
// exactly) until real data justifies loosening it. A single named constant
// so that recalibration is a one-line change, not a design decision buried
// inside scoring logic.
const STRUCTURED_MATCH_AUTO_THRESHOLD = 1.0;

// Decision 0011 / docs/catalog-schema.sql section 8 — the match ladder:
//
//   0. vendor_product_map exact ────► link, done (never re-guessed)
//   1. product_code exact ──────────► link, done
//   2. brand + mfr_part_number exact ► link
//   3. GTIN exact, where present ───► link
//   4. structured: brand + category + variant-defining attributes
//   5. fuzzy name (pg_trgm) ────────► candidates → review
//   6. no match ────────────────────► new product request
//
// MPN before GTIN deliberately (0011): GTIN/GS1-India adoption is weak in
// this trade; MPN is what dealers actually order on.
//
// STONE skips 2-3 (no MPN, no GTIN) — its ladder is variety_alias -> fuzzy,
// defaulting to needs_review unless an alias matches exactly (decision
// 0003): fuzzy-matching trade names is how a catalog fragments.
@Injectable()
export class VendorMatchLadderService {
  private readonly logger = new Logger(VendorMatchLadderService.name);

  constructor(
    @InjectModel(VendorProductMap)
    private readonly vendorProductMapModel: typeof VendorProductMap,
    @InjectModel(MasterProduct)
    private readonly masterProductModel: typeof MasterProduct,
    @InjectModel(Category)
    private readonly categoryModel: typeof Category,
    @InjectModel(Attribute)
    private readonly attributeModel: typeof Attribute,
    @InjectModel(MasterProductAttributeValue)
    private readonly attributeValueModel: typeof MasterProductAttributeValue,
    @InjectModel(StoneVarietyAlias)
    private readonly stoneVarietyAliasModel: typeof StoneVarietyAlias,
    private readonly brandResolver: BrandResolverService,
    private readonly sequelize: Sequelize,
  ) {}

  async match(row: VendorInventoryRow): Promise<MatchVerdict> {
    const isStone = row.stoneVarietyName !== undefined;
    // The vendor's own persistent code, falling back to whatever text
    // identified the product this time — see the comment on
    // VendorInventoryRow.vendorSku for why these are NOT the same thing
    // and why the fallback matters (a vendor with no code of their own
    // still needs SOMETHING remembered against them).
    const mapKey = row.vendorSku ?? row.productRef;

    // Step 0 — vendor_product_map exact. Never re-guessed: a prior
    // confirmed match (by vendor or admin) is authoritative regardless of
    // what the row's product_ref looks like this time.
    const mapped = await this.vendorProductMapModel.findOne({
      where: { vendorId: row.vendorId, vendorSku: mapKey },
    });
    if (mapped) {
      return this.autoMatch(mapped.masterProductId, 1.0, ImportMatchMethod.MANUAL, mapKey);
      // MANUAL because vendor_product_map only ever exists from a prior
      // manual (vendor or admin) confirmation — it is not one of the
      // deterministic identifier methods below.
    }

    // Step 1 — product_code exact (the pre-filled-export path, decision
    // 0011). The primary path for vendors using the pre-filled sheet, since
    // the code is already correct in every row they didn't delete.
    const byCode = await this.masterProductModel.findOne({
      where: { productCode: row.productRef },
    });
    if (byCode) {
      return this.autoMatch(byCode.id, 1.0, ImportMatchMethod.MANUAL, mapKey);
      // MANUAL here too — product_code is an identifier the platform
      // handed the vendor, not one the ImportMatchMethod enum names
      // separately (gtin/mpn/structured/variety_alias/fuzzy are all about
      // MATCHING free text; an exact code echo isn't a match at all).
    }

    if (isStone) {
      return this.matchStone(row, mapKey);
    }

    // Step 2 — brand + mfr_part_number exact. Brand resolution goes
    // through BrandResolverService, not a plain ILIKE on row.brandName —
    // Phase 7 risk 1 (catalog-integrity-residual-risks.md): an ILIKE catches
    // "havells" vs "Havells" but not "Havells" vs "Havells India Ltd",
    // which would silently create a false negative here (falling through
    // to structured/fuzzy matching for a product this step should have
    // caught outright) rather than the dangerous direction — but the same
    // resolver is what closes the actual duplicate-BRAND-ROW hole
    // elsewhere (admin import, vendor review-queue resolution), so using
    // it consistently here too means one brand-matching behaviour across
    // the whole catalog, not a different rule per entry point.
    if (row.brandName) {
      const resolvedBrand = await this.brandResolver.resolve(row.brandName);
      if (resolvedBrand) {
        const byMpn = await this.masterProductModel.findOne({
          where: { mfrPartNumber: row.productRef, brandId: resolvedBrand.id },
        });
        if (byMpn) {
          return this.autoMatch(byMpn.id, 1.0, ImportMatchMethod.MPN, mapKey);
        }
      }
    }

    // Step 3 — GTIN exact, where present.
    const byGtin = await this.masterProductModel.findOne({
      where: { gtin: row.productRef },
    });
    if (byGtin) {
      return this.autoMatch(byGtin.id, 1.0, ImportMatchMethod.GTIN, mapKey);
    }

    // Step 4 — structured: brand + category + variant-defining attributes.
    if (row.brandName && row.categoryId && row.attributeValues) {
      const structured = await this.matchStructured(row, mapKey);
      if (structured) return structured;
    }

    // Step 5 — fuzzy name (pg_trgm). Always needs_review, ranked candidates.
    return this.matchFuzzy(row, mapKey);
  }

  private autoMatch(
    masterProductId: string,
    confidence: number,
    method: ImportMatchMethod,
    vendorMapKey: string,
    // Runner-up candidates (Phase 7 risk 2) — deliberately still carried on
    // an auto-matched verdict, not just a needs_review one. Steps 0-3
    // (deterministic identifiers) have no runners-up to show and pass [],
    // but step 4 (structured) does: even a CONFIDENT structured match came
    // from scoring several candidates, and the vendor should see what else
    // was close before confirming — "show two or three candidates rather
    // than one yes/no."
    candidates: ImportMatchCandidate[] = [],
  ): MatchVerdict {
    return {
      status: 'auto_matched',
      matchedMasterProductId: masterProductId,
      matchConfidence: confidence,
      matchMethod: method,
      candidates,
      vendorMapKey,
    };
  }

  // Stone skips steps 2-3 entirely (no MPN, no GTIN — decision 0003). Ladder
  // is variety_alias -> fuzzy, defaulting to needs_review unless an alias
  // matches exactly.
  private async matchStone(row: VendorInventoryRow, mapKey: string): Promise<MatchVerdict> {
    const aliasName = (row.stoneVarietyName ?? row.productRef).trim().toLowerCase();

    const alias = await this.stoneVarietyAliasModel.findOne({
      where: { alias: aliasName },
    });

    if (alias) {
      // An alias identifies a STONE VARIETY, not a specific master_product
      // — a variety can have multiple master_product rows (e.g. different
      // finishes of the same stone). Resolve to a single product only when
      // exactly one live product exists for that variety; otherwise this
      // is a candidate set, not an auto-match, even though the variety
      // itself is unambiguous.
      const products = await this.masterProductModel.findAll({
        where: { stoneVarietyId: alias.stoneVarietyId, status: 'live' },
        limit: 2,
      });
      if (products.length === 1) {
        return this.autoMatch(products[0].id, 1.0, ImportMatchMethod.VARIETY_ALIAS, mapKey);
      }
      if (products.length > 1) {
        return {
          status: 'needs_review',
          matchedMasterProductId: null,
          matchConfidence: null,
          matchMethod: ImportMatchMethod.VARIETY_ALIAS,
          candidates: products.map((p) => ({
            masterProductId: p.id,
            score: 1.0,
            matchedOn: `stone_variety_alias: "${aliasName}"`,
          })),
          vendorMapKey: mapKey,
        };
      }
      // alias resolved to a variety, but that variety has no live product
      // yet — falls through to fuzzy, which will likely also find nothing,
      // correctly routing to a new product request (step 6).
    }

    return this.matchFuzzy(row, mapKey, 'stone');
  }

  // Step 4: exact brand + category + every variant-defining attribute for
  // that category, matching. "If confident" (catalog-excel-flows.md) is
  // implemented as: candidate found only when EVERY variant-defining
  // attribute the row supplies matches the candidate's own value —
  // STRUCTURED_MATCH_AUTO_THRESHOLD gates whether that counts as an
  // auto-match or drops to a review candidate.
  private async matchStructured(
    row: VendorInventoryRow,
    mapKey: string,
  ): Promise<MatchVerdict | null> {
    const variantDefining = await this.attributeModel.findAll({
      where: { categoryId: row.categoryId, isVariantDefining: true, isActive: true },
    });
    if (variantDefining.length === 0) return null; // nothing to structure-match on

    // Resolve the typed brand through BrandResolverService, not a raw
    // ILIKE — see the comment on step 2 above (Phase 7 risk 1).
    const resolvedBrand = await this.brandResolver.resolve(row.brandName!);
    if (!resolvedBrand) return null; // unresolvable brand: nothing to structure-match on

    const candidates = await this.masterProductModel.findAll({
      where: { categoryId: row.categoryId, brandId: resolvedBrand.id },
      include: [{ model: MasterProductAttributeValue }],
    });

    const scored: Array<{ product: MasterProduct; score: number; matchedCount: number }> = [];
    for (const candidate of candidates) {
      let matchedCount = 0;
      for (const attr of variantDefining) {
        const rowValue = row.attributeValues?.[attr.code];
        if (rowValue === undefined) continue;
        const candidateValue = candidate.attributeValues?.find(
          (v) => v.attributeId === attr.id,
        )?.value;
        if (
          candidateValue !== undefined &&
          this.normalizeForCompare(candidateValue, attr.dataType) ===
            this.normalizeForCompare(rowValue, attr.dataType)
        ) {
          matchedCount++;
        }
      }
      const score = variantDefining.length > 0 ? matchedCount / variantDefining.length : 0;
      if (score > 0) scored.push({ product: candidate, score, matchedCount });
    }

    if (scored.length === 0) return null;
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];

    if (
      best.score >= STRUCTURED_MATCH_AUTO_THRESHOLD &&
      scored.filter((s) => s.score === best.score).length === 1
    ) {
      // Auto-match only when the top score clears the threshold AND is
      // unambiguous — a tie at the winning score is a review case, not a
      // coin flip the system decides silently.
      //
      // A tie at score 1.0 between two LIVE candidates cannot actually
      // happen: it would require two live products sharing an identical
      // variant-defining attribute SET, which
      // master_product_generic_identity (decision 0013) already forbids at
      // the database level — confirmed by reproducing that exact collision
      // directly against Postgres while building this test. So this guard
      // is defensive for the case that constraint doesn't cover: a tie
      // between a LIVE product and a DRAFT one (candidates here are not
      // filtered by status), where the draft hasn't published yet and so
      // hasn't hit the constraint. Below-threshold ties (score < 1.0, the
      // common case when a vendor's row omits an attribute that would
      // otherwise disambiguate) are caught by the threshold check alone,
      // independent of this tie check, and that path IS common.
      const runnersUp = scored.slice(1, FUZZY_CANDIDATE_LIMIT).map((s) => ({
        masterProductId: s.product.id,
        score: s.score,
        matchedOn: `structured: ${s.matchedCount}/${variantDefining.length} variant-defining attributes`,
      }));
      return this.autoMatch(
        best.product.id,
        best.score,
        ImportMatchMethod.STRUCTURED,
        mapKey,
        runnersUp,
      );
    }

    return {
      status: 'needs_review',
      matchedMasterProductId: null,
      matchConfidence: null,
      matchMethod: ImportMatchMethod.STRUCTURED,
      candidates: scored.slice(0, FUZZY_CANDIDATE_LIMIT).map((s) => ({
        masterProductId: s.product.id,
        score: s.score,
        matchedOn: `structured: ${s.matchedCount}/${variantDefining.length} variant-defining attributes`,
      })),
      vendorMapKey: mapKey,
    };
  }

  private normalizeForCompare(value: string, dataType: string): string {
    if (dataType === 'number' && /^-?\d+(\.\d+)?$/.test(value.trim())) {
      // Mirror build_identity_hash()'s numeric normalisation (decision
      // 0013) — 32 and 32.0 must compare equal here too, for the same
      // reason: a trailing-zero difference is not a real mismatch.
      return String(parseFloat(value));
    }
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  // Step 5 / stone's fallback: fuzzy name match via pg_trgm similarity().
  // Always needs_review — fuzzy-matching trade names is how a catalog
  // fragments (decision 0003), so this NEVER auto-matches regardless of
  // score.
  private async matchFuzzy(
    row: VendorInventoryRow,
    mapKey: string,
    scope: 'default' | 'stone' = 'default',
  ): Promise<MatchVerdict> {
    const searchTerm = row.stoneVarietyName ?? row.productRef;

    const categoryFilter = row.categoryId ? 'AND category_id = :categoryId' : '';
    const rows = await this.sequelize.query<{
      id: string;
      similarity: number;
    }>(
      `SELECT id, similarity(name, :term) AS similarity
         FROM master_product
        WHERE status = 'live'
          AND similarity(name, :term) >= :minSimilarity
          ${categoryFilter}
        ORDER BY similarity DESC
        LIMIT :limit`,
      {
        replacements: {
          term: searchTerm,
          minSimilarity: FUZZY_CANDIDATE_MIN_SIMILARITY,
          categoryId: row.categoryId ?? null,
          limit: FUZZY_CANDIDATE_LIMIT,
        },
        type: QueryTypes.SELECT,
      },
    );

    if (rows.length === 0) {
      // Step 6 — no match. Becomes a new product request (empty
      // candidates is exactly what signals that to the review queue —
      // catalog-excel-flows.md Flow 3).
      return {
        status: 'needs_review',
        matchedMasterProductId: null,
        matchConfidence: null,
        matchMethod: null,
        candidates: [],
        vendorMapKey: mapKey,
      };
    }

    return {
      status: 'needs_review',
      matchedMasterProductId: null,
      matchConfidence: null,
      matchMethod: scope === 'stone' ? ImportMatchMethod.VARIETY_ALIAS : ImportMatchMethod.FUZZY,
      candidates: rows.map((r) => ({
        masterProductId: r.id,
        score: r.similarity,
        matchedOn: `fuzzy name similarity (pg_trgm): ${r.similarity.toFixed(3)}`,
      })),
      vendorMapKey: mapKey,
    };
  }
}
