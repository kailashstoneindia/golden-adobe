import { Injectable } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';
import { PaginatedResponse, VendorCatalogProductDto } from '@golden-abode/types';

import { VendorCatalogSearchQueryDto } from './dto/vendor-catalog-search.dto';
import { buildProductSearchClause, productSearchOrderBy } from './product-search-filter.util';

// Decision 0053 — vendor-facing catalog search, so a vendor can find a
// master_product id to list against via POST /vendor/listings, without
// building a bulk sheet for one product. Deliberately NOT the match
// ladder (VendorMatchLadderService): that resolves AMBIGUOUS free text
// from a spreadsheet cell; this is a plain search the vendor reads and
// picks from directly, so there's no ambiguity to resolve.
//
// Shares its word_similarity + exact-code matching with
// AdminCatalogService.listProducts via product-search-filter.util.ts, so
// a fix to the ranking threshold lands in one place for both. ALWAYS
// restricted to status = 'live' here — a vendor must never be able to
// list against a draft/pending_review/deprecated product.
@Injectable()
export class VendorCatalogSearchService {
  constructor(private readonly sequelize: Sequelize) {}

  async search(
    query: VendorCatalogSearchQueryDto,
  ): Promise<PaginatedResponse<VendorCatalogProductDto>> {
    const limit = Math.min(query.limit ?? 25, 100);
    const page = query.page ?? 1;
    const offset = (page - 1) * limit;

    const where: string[] = [`mp.status = 'live'`];
    const replacements: Record<string, unknown> = { limit, offset };

    if (query.search) {
      where.push(buildProductSearchClause());
      replacements.search = query.search;
    }
    if (query.categoryId) {
      where.push(`mp.category_id = :categoryId`);
      replacements.categoryId = query.categoryId;
    }

    const whereSql = where.join(' AND ');

    const rows = await this.sequelize.query<{
      id: string;
      name: string;
      product_code: string;
      brand: string | null;
      category_path: string;
      sale_unit_type: string;
    }>(
      `SELECT
         mp.id, mp.name, mp.product_code,
         b.name AS brand, cat.path AS category_path,
         mp.sale_unit_type::text AS sale_unit_type
       FROM master_product mp
       JOIN category cat ON cat.id = mp.category_id
       LEFT JOIN brand b ON b.id = mp.brand_id
       WHERE ${whereSql}
       ORDER BY ${productSearchOrderBy(Boolean(query.search))} mp.name ASC
       LIMIT :limit OFFSET :offset`,
      { type: QueryTypes.SELECT, replacements },
    );

    const [{ total }] = await this.sequelize.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM master_product mp WHERE ${whereSql}`,
      { type: QueryTypes.SELECT, replacements },
    );

    const totalCount = Number(total);

    return {
      items: rows.map((row) => ({
        masterProductId: row.id,
        name: row.name,
        productCode: row.product_code,
        brand: row.brand,
        categoryPath: row.category_path,
        saleUnitType: row.sale_unit_type as VendorCatalogProductDto['saleUnitType'],
      })),
      total: totalCount,
      page,
      limit,
      totalPages: limit > 0 ? Math.ceil(totalCount / limit) : 0,
    };
  }
}
