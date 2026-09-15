import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { QueryTypes } from 'sequelize';
import {
  SearchDocument,
  SearchDocumentRecord,
  buildSearchDocumentId,
  toSearchDocumentRecord,
} from '@golden-abode/types';

import { MasterProduct } from '../../catalog/models/master-product.model';

// Phase 6f (decision 0021, search-system-design.md sections 3 and 5).
//
// Turns candidate (product, city) pairs into documents — or into a list of
// ids to delete. The split between the two is NOT decided by how a pair was
// discovered; it is re-verified against current state in a single query, so
// three independent reasons a document should vanish collapse into one code
// path with no special-casing:
//
//   * the product's status moved off 'live'
//   * the city was deactivated
//   * no vendor_listing remains for any vendor in that city
//
// Anything the query returns is upserted; anything absent is deleted.

export type CandidatePair = {
  masterProductId: string;
  cityId: string;
};

export type BuildResult = {
  // Pairs that still resolve to a live, purchasable product in that city.
  documents: SearchDocumentRecord[];
  // Document ids for pairs that no longer do. Deterministic ids mean this
  // needs no filtered delete and no lookup — just the id.
  deleteIds: string[];
};

@Injectable()
export class SearchDocumentBuilder {
  constructor(
    @InjectModel(MasterProduct)
    private readonly masterProductModel: typeof MasterProduct,
  ) {}

  private get sequelize() {
    return this.masterProductModel.sequelize!;
  }

  async build(pairs: CandidatePair[]): Promise<BuildResult> {
    if (pairs.length === 0) return { documents: [], deleteIds: [] };

    const productIds = pairs.map((p) => p.masterProductId);
    const cityIds = pairs.map((p) => p.cityId);

    // unnest() rather than a temp table so this is a single round trip and
    // needs no transaction of its own.
    const rows = await this.sequelize.query<{
      master_product_id: string;
      city_id: string;
      name: string;
      category_path: string;
      brand: string | null;
      attributes: Record<string, string | number | boolean>;
      price: string;
      cheapest_vendor_listing_id: string;
      vendor_count: string;
      in_stock: boolean;
      updated_at: Date;
    }>(
      `
      WITH candidate AS (
        SELECT DISTINCT * FROM unnest(
          CAST($1 AS uuid[]),
          CAST($2 AS uuid[])
        ) AS t(master_product_id, city_id)
      ),
      live AS (
        SELECT
          cand.master_product_id,
          cand.city_id,
          mp.name,
          cat.path AS category_path,
          b.name   AS brand,
          mp.attributes_flat AS attributes,
          mp.updated_at
        FROM candidate cand
        JOIN master_product mp ON mp.id = cand.master_product_id AND mp.status = 'live'
        JOIN city c            ON c.id = cand.city_id            AND c.is_active
        JOIN category cat      ON cat.id = mp.category_id
        LEFT JOIN brand b      ON b.id = mp.brand_id
      )
      SELECT
        live.master_product_id,
        live.city_id,
        live.name,
        live.category_path,
        live.brand,
        live.attributes,
        live.updated_at,
        agg.price,
        agg.vendor_count,
        agg.cheapest_vendor_listing_id,
        agg.in_stock
      FROM live
      -- LATERAL, not a correlated subquery per column: the cheapest listing's
      -- id and its price must come from the SAME row, or a tie could report
      -- one vendor's price against another vendor's listing id.
      JOIN LATERAL (
        SELECT
          MIN(vl.price)                             AS price,
          COUNT(DISTINCT vl.vendor_id)              AS vendor_count,
          (ARRAY_AGG(vl.id ORDER BY vl.price ASC, vl.id ASC))[1] AS cheapest_vendor_listing_id,
          -- Decision 0024 rules 4 and 5. Computed INSIDE the aggregate as an
          -- output column, never as a WHERE on the joined listings: filtering
          -- here would drop an out-of-stock product from the index entirely
          -- instead of indexing it as in_stock = false.
          --
          -- The CASE order matters. Paint (tinted_to_order) never gets an
          -- inventory row by design (0007, 0022 rule 4), so for paint an
          -- absent row means AVAILABLE. For anything else an absent row means
          -- stock was never set, which is NOT available. Same NULL, opposite
          -- meanings, and only sale_unit_type separates them.
          BOOL_OR(
            CASE
              WHEN mp2.sale_unit_type = 'tinted_to_order' THEN TRUE
              WHEN inv.vendor_listing_id IS NULL THEN FALSE
              ELSE (inv.quantity_available - inv.quantity_reserved) > 0
            END
          )                                         AS in_stock
        FROM vendor_listing vl
        JOIN vendors v ON v.id = vl.vendor_id
        JOIN master_product mp2 ON mp2.id = vl.master_product_id
        -- warehouse_id IS NULL matches the partial unique index installed by
        -- 20260914090000; idx_inventory_listing_all serves this lookup
        -- unpartialed, so out-of-stock rows are reachable.
        LEFT JOIN inventory inv
          ON inv.vendor_listing_id = vl.id AND inv.warehouse_id IS NULL
        WHERE vl.master_product_id = live.master_product_id
          AND v.city_id = live.city_id
          AND vl.status = 'active'
      ) agg ON agg.cheapest_vendor_listing_id IS NOT NULL
      `,
      // bind, NOT replacements. Sequelize expands a `replacements` array into
      // a comma-separated list for `IN (...)`, so an array parameter reaches
      // Postgres as bare text and CAST(... AS uuid[]) fails with "malformed
      // array literal". bind passes the array through as a real parameter.
      { type: QueryTypes.SELECT, bind: [productIds, cityIds] },
    );

    const present = new Set<string>();
    const documents: SearchDocumentRecord[] = [];

    for (const row of rows) {
      const id = buildSearchDocumentId(row.master_product_id, row.city_id);
      present.add(id);

      const doc: SearchDocument = {
        id,
        masterProductId: row.master_product_id,
        cityId: row.city_id,
        name: row.name,
        categoryPath: row.category_path,
        brand: row.brand,
        attributes: row.attributes ?? {},
        price: Number(row.price),
        cheapestVendorListingId: row.cheapest_vendor_listing_id,
        vendorCount: Number(row.vendor_count),
        inStock: row.in_stock,
        updatedAt: row.updated_at.toISOString(),
      };
      documents.push(toSearchDocumentRecord(doc));
    }

    // Everything asked about that did not come back is, by definition, no
    // longer indexable — for whichever of the three reasons.
    const deleteIds = [
      ...new Set(
        pairs
          .map((p) => buildSearchDocumentId(p.masterProductId, p.cityId))
          .filter((id) => !present.has(id)),
      ),
    ];

    return { documents, deleteIds };
  }
}
