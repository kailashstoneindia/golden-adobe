import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { QueryTypes } from 'sequelize';
import { SearchDocument, buildSearchDocumentId } from '@golden-abode/types';

import { MasterProduct } from '../../catalog/models/master-product.model';

// Phase 6c (decision 0021, search-system-design.md section 8 "fallback/").
//
// This is NOT scaffolding for Meilisearch, and it is not deleted once
// Meilisearch ships. Per decision 0019 it has two permanent jobs:
//
//   1. The outage fallback — when Meilisearch is down or mid-rebuild, this
//      keeps the site up. A fallback nobody exercises is not a fallback.
//   2. Admin's PRIMARY search path — a draft product has no vendor_listing,
//      so it produces no search document, so Meilisearch structurally cannot
//      represent it. Admin has to find drafts. Only Postgres can do that.
//
// Both indexes this relies on already exist from Phase 2 —
// idx_master_product_name_trgm (gin, name gin_trgm_ops) and
// idx_master_product_attributes (gin, attributes_flat) — so 6c needed no
// migration of its own.

export type PostgresSearchInput = {
  query?: string;
  cityId: string;
  categoryPath?: string;
  brand?: string;
  // Matched against master_product.attributes_flat via the @> containment
  // operator, which is what idx_master_product_attributes accelerates.
  attributes?: Record<string, string | number | boolean>;
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
  limit?: number;
  offset?: number;
};

export type AdminSearchInput = {
  query?: string;
  categoryPath?: string;
  brand?: string;
  // Admin deliberately searches across statuses — finding a draft is the
  // entire reason this path exists (0019). Values mirror the
  // master_product_status enum exactly.
  status?: 'draft' | 'pending_review' | 'live' | 'deprecated';
  limit?: number;
  offset?: number;
};

export type AdminSearchResult = {
  masterProductId: string;
  productCode: string;
  name: string;
  categoryPath: string;
  brand: string | null;
  status: string;
  listingCount: number;
};

// word_similarity floor, compared inline in each query. Named here so the
// threshold is reviewable rather than implicit, and kept out of session state
// (set_limit) so a server-level change cannot silently alter search results.
// 0.5 with word_similarity is meaningfully stricter than it sounds: an exact
// keyword scores 1.0 and a one-character typo around 0.7, while unrelated
// text scores 0.
const TRIGRAM_THRESHOLD = 0.5;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

@Injectable()
export class PostgresSearchService {
  private readonly logger = new Logger(PostgresSearchService.name);

  constructor(
    @InjectModel(MasterProduct)
    private readonly masterProductModel: typeof MasterProduct,
  ) {}

  private get sequelize() {
    return this.masterProductModel.sequelize!;
  }

  // Customer-facing search. Returns the SAME SearchDocument[] shape the
  // Meilisearch path returns, so search.service.ts can swap engines without
  // any caller noticing which one answered.
  async search(input: PostgresSearchInput): Promise<SearchDocument[]> {
    const limit = Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const offset = input.offset ?? 0;

    const replacements: Record<string, unknown> = {
      cityId: input.cityId,
      limit,
      offset,
    };

    const where: string[] = [
      "mp.status = 'live'",
      "vl.status = 'active'",
      'c.is_active = true',
      'v.city_id = :cityId',
    ];

    if (input.query) {
      // word_similarity(query, name), NOT similarity(). similarity() compares
      // two strings as wholes and penalises length difference, so a keyword
      // against a full product name scores far below any sane threshold —
      // similarity('Havells MCB 32A C-Curve', 'MCB') is 0.15, which no
      // useful threshold can accept without also accepting noise.
      // word_similarity finds the best-matching word RUN inside the name:
      // 'MCB' scores 1.0, the typo 'Havels' 0.71, unrelated text 0.
      //
      // The threshold is compared inline rather than via the <% operator plus
      // set_limit(), because set_limit is per-SESSION state and issuing it as
      // a second statement makes Sequelize return the set_limit result set
      // instead of this query's.
      where.push(`word_similarity(:query, mp.name) >= ${TRIGRAM_THRESHOLD}`);
      replacements.query = input.query;
    }

    if (input.categoryPath) {
      // Prefix match so a parent category returns its whole subtree —
      // idx_category_path already exists for exactly this.
      where.push('(cat.path = :categoryPath OR cat.path LIKE :categoryPathPrefix)');
      replacements.categoryPath = input.categoryPath;
      replacements.categoryPathPrefix = `${input.categoryPath}/%`;
    }

    if (input.brand) {
      where.push('b.name ILIKE :brand');
      replacements.brand = input.brand;
    }

    if (input.attributes && Object.keys(input.attributes).length > 0) {
      where.push('mp.attributes_flat @> CAST(:attributes AS jsonb)');
      replacements.attributes = JSON.stringify(input.attributes);
    }

    // Price filters apply to the CHEAPEST listing in this city, which is what
    // the customer actually sees — hence HAVING, not WHERE.
    const having: string[] = [];
    if (input.minPrice !== undefined) {
      having.push('MIN(vl.price) >= :minPrice');
      replacements.minPrice = input.minPrice;
    }
    if (input.maxPrice !== undefined) {
      having.push('MIN(vl.price) <= :maxPrice');
      replacements.maxPrice = input.maxPrice;
    }

    const orderBy = input.query
      ? 'ORDER BY word_similarity(:query, mp.name) DESC, min_price ASC'
      : 'ORDER BY min_price ASC';

    const sql = `
      SELECT
        mp.id                        AS master_product_id,
        mp.name                      AS name,
        cat.path                     AS category_path,
        b.name                       AS brand,
        mp.attributes_flat           AS attributes,
        MIN(vl.price)                AS min_price,
        COUNT(DISTINCT vl.vendor_id) AS vendor_count,
        mp.updated_at                AS updated_at,
        (
          SELECT vl2.id FROM vendor_listing vl2
          JOIN vendors v2 ON v2.id = vl2.vendor_id
          WHERE vl2.master_product_id = mp.id
            AND vl2.status = 'active'
            AND v2.city_id = :cityId
          ORDER BY vl2.price ASC
          LIMIT 1
        )                            AS cheapest_vendor_listing_id
      FROM master_product mp
      JOIN vendor_listing vl ON vl.master_product_id = mp.id
      JOIN vendors v         ON v.id = vl.vendor_id
      JOIN city c            ON c.id = v.city_id
      JOIN category cat      ON cat.id = mp.category_id
      LEFT JOIN brand b      ON b.id = mp.brand_id
      WHERE ${where.join(' AND ')}
      GROUP BY mp.id, mp.name, cat.path, b.name, mp.attributes_flat, mp.updated_at
      ${having.length > 0 ? `HAVING ${having.join(' AND ')}` : ''}
      ${orderBy}
      LIMIT :limit OFFSET :offset
    `;

    const rows = await this.sequelize.query<{
      master_product_id: string;
      name: string;
      category_path: string;
      brand: string | null;
      attributes: Record<string, string | number | boolean>;
      min_price: string;
      vendor_count: string;
      updated_at: Date;
      cheapest_vendor_listing_id: string;
    }>(sql, { type: QueryTypes.SELECT, replacements });

    return rows.map((row) => ({
      id: buildSearchDocumentId(row.master_product_id, input.cityId),
      masterProductId: row.master_product_id,
      cityId: input.cityId,
      name: row.name,
      categoryPath: row.category_path,
      brand: row.brand,
      attributes: row.attributes ?? {},
      price: Number(row.min_price),
      cheapestVendorListingId: row.cheapest_vendor_listing_id,
      vendorCount: Number(row.vendor_count),
      // A row only reaches here by joining an ACTIVE listing, so anything
      // returned is in stock by construction.
      inStock: true,
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  // Admin search. Deliberately does NOT join vendor_listing, so products with
  // zero listings — every draft, by definition — are findable. This is the
  // half of 0019 that Meilisearch cannot do at all.
  async searchAdmin(input: AdminSearchInput): Promise<AdminSearchResult[]> {
    const limit = Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const offset = input.offset ?? 0;

    const replacements: Record<string, unknown> = { limit, offset };
    const where: string[] = ['1 = 1'];

    if (input.query) {
      // Admin also matches on product_code exactly — an admin pasting
      // "GA-0000123" expects that row, not a fuzzy name match.
      where.push(
        `(word_similarity(:query, mp.name) >= ${TRIGRAM_THRESHOLD} OR mp.product_code = :exactQuery)`,
      );
      replacements.query = input.query;
      replacements.exactQuery = input.query;
    }
    if (input.categoryPath) {
      where.push('(cat.path = :categoryPath OR cat.path LIKE :categoryPathPrefix)');
      replacements.categoryPath = input.categoryPath;
      replacements.categoryPathPrefix = `${input.categoryPath}/%`;
    }
    if (input.brand) {
      where.push('b.name ILIKE :brand');
      replacements.brand = input.brand;
    }
    if (input.status) {
      where.push('mp.status = CAST(:status AS master_product_status)');
      replacements.status = input.status;
    }

    const sql = `
      SELECT
        mp.id           AS master_product_id,
        mp.product_code AS product_code,
        mp.name         AS name,
        cat.path        AS category_path,
        b.name          AS brand,
        mp.status::text AS status,
        (
          SELECT COUNT(*) FROM vendor_listing vl
          WHERE vl.master_product_id = mp.id AND vl.status = 'active'
        )               AS listing_count
      FROM master_product mp
      JOIN category cat ON cat.id = mp.category_id
      LEFT JOIN brand b ON b.id = mp.brand_id
      WHERE ${where.join(' AND ')}
      ${input.query ? 'ORDER BY word_similarity(:query, mp.name) DESC' : 'ORDER BY mp.updated_at DESC'}
      LIMIT :limit OFFSET :offset
    `;

    const rows = await this.sequelize.query<{
      master_product_id: string;
      product_code: string;
      name: string;
      category_path: string;
      brand: string | null;
      status: string;
      listing_count: string;
    }>(sql, {
      type: QueryTypes.SELECT,
      replacements,
    });

    return rows.map((row) => ({
      masterProductId: row.master_product_id,
      productCode: row.product_code,
      name: row.name,
      categoryPath: row.category_path,
      brand: row.brand,
      status: row.status,
      listingCount: Number(row.listing_count),
    }));
  }
}
