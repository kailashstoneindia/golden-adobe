import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';
import { BulkStockResult, PaginatedResponse, VendorListingStockDto } from '@golden-abode/types';

import { VendorListing, VendorListingStatus } from './models/vendor-listing.model';
import { SaleUnitType } from './models/master-product.model';
import { BulkSetStockDto, ListVendorListingsQueryDto } from './dto/vendor-stock.dto';

// Vendor-facing stock and availability. The `inventory` table was fully
// designed in Phase 4 and then never written to by anything — this service
// is its first writer.
//
// Two rules hold throughout, both agreed explicitly:
//
//   1. STOCK AND STATUS ARE INDEPENDENT. setStock never touches `status`;
//      setStatus never touches quantity. `quantity_available = 0` with
//      `status = 'active'` is legal and is the vendor's to resolve.
//
//   2. PAINT HAS NO INVENTORY ROW (decision 0007). A tinted_to_order
//      product is a product line plus a pack size, not a countable bucket,
//      so availability for paint lives on vendor_listing.status alone.
//      Writing stock against a paint listing is rejected rather than
//      silently ignored — a vendor who typed a number deserves to know it
//      went nowhere.
//
// Ownership is always checked HERE, from the authenticated vendor id,
// never taken from the request path. A listing belonging to someone else
// returns 404 rather than 403, so the API does not confirm that another
// vendor's listing id exists.
// Every inventory write here goes through raw SQL rather than the Sequelize
// model: the single-row path needs `ON CONFLICT ... WHERE warehouse_id IS
// NULL` to target a PARTIAL unique index, and the bulk path needs
// `unnest()` to stay one statement. Neither is expressible through
// upsert()/bulkCreate(), so the Inventory model is deliberately not
// injected — it would be an unused dependency implying a write path that
// does not exist.
@Injectable()
export class StockService {
  constructor(
    @InjectModel(VendorListing)
    private readonly vendorListingModel: typeof VendorListing,
    private readonly sequelize: Sequelize,
  ) {}

  async listForVendor(
    vendorId: string,
    query: ListVendorListingsQueryDto,
  ): Promise<PaginatedResponse<VendorListingStockDto>> {
    const limit = Math.min(query.limit ?? 25, 100);
    const page = query.page ?? 1;
    const offset = (page - 1) * limit;

    const where: string[] = ['vl.vendor_id = :vendorId'];
    const replacements: Record<string, unknown> = { vendorId, limit, offset };

    if (query.status) {
      where.push(`vl.status = CAST(:status AS vendor_listing_status)`);
      replacements.status = query.status;
    }

    const whereSql = where.join(' AND ');

    // LEFT JOIN, not JOIN: a listing with no inventory row must still
    // appear. Those are precisely the rows a vendor signs in to fix, and
    // an inner join would hide every listing whose stock has never been
    // set — including all of them, today.
    //
    // The join is restricted to warehouse_id IS NULL to match the
    // uniqueness rule the migration installs. With warehouses unused, that
    // is every row; when warehouses exist this query needs revisiting to
    // decide whether it sums across them or reports per-warehouse, which
    // is why the restriction is explicit rather than implied.
    const rows = await this.sequelize.query<{
      vendor_listing_id: string;
      master_product_id: string;
      product_name: string;
      product_code: string;
      vendor_sku: string | null;
      stated_grade: string | null;
      price: string;
      mrp: string | null;
      status: string;
      quantity_available: string | null;
      sale_unit_type: string;
      updated_at: Date;
    }>(
      `SELECT
         vl.id AS vendor_listing_id,
         vl.master_product_id,
         mp.name AS product_name,
         mp.product_code,
         vl.vendor_sku,
         vl.stated_grade,
         vl.price,
         vl.mrp,
         vl.status::text AS status,
         inv.quantity_available,
         mp.sale_unit_type::text AS sale_unit_type,
         vl.updated_at
       FROM vendor_listing vl
       JOIN master_product mp ON mp.id = vl.master_product_id
       LEFT JOIN inventory inv
         ON inv.vendor_listing_id = vl.id AND inv.warehouse_id IS NULL
       WHERE ${whereSql}
       ORDER BY vl.updated_at DESC
       LIMIT :limit OFFSET :offset`,
      { type: QueryTypes.SELECT, replacements },
    );

    const [{ total }] = await this.sequelize.query<{ total: string }>(
      `SELECT COUNT(*) AS total
         FROM vendor_listing vl
        WHERE ${whereSql}`,
      { type: QueryTypes.SELECT, replacements },
    );

    const totalCount = Number(total);

    return {
      items: rows.map((row) => ({
        vendorListingId: row.vendor_listing_id,
        masterProductId: row.master_product_id,
        productName: row.product_name,
        productCode: row.product_code,
        vendorSku: row.vendor_sku,
        statedGrade: row.stated_grade,
        // DECIMAL comes back from Postgres as a string. Number() here
        // rather than at the edge so the DTO's declared number type is
        // actually true of the value.
        price: Number(row.price),
        mrp: row.mrp === null ? null : Number(row.mrp),
        status: row.status as VendorListingStockDto['status'],
        quantityAvailable: row.quantity_available === null ? null : Number(row.quantity_available),
        isPaint: row.sale_unit_type === SaleUnitType.TINTED_TO_ORDER,
        updatedAt: row.updated_at.toISOString(),
      })),
      total: totalCount,
      page,
      limit,
      totalPages: limit > 0 ? Math.ceil(totalCount / limit) : 0,
    };
  }

  async setStock(
    vendorId: string,
    vendorListingId: string,
    quantityAvailable: number,
  ): Promise<VendorListingStockDto> {
    const listing = await this.assertListingOwned(vendorId, vendorListingId);
    await this.assertNotPaint(listing);

    // ON CONFLICT against the partial unique index installed by
    // 20260914090000. A plain findOrCreate-then-update would race: two
    // concurrent "set my stock" calls could both miss and both insert,
    // which is exactly the duplicate the index now forbids — turning a
    // silent data split into a constraint error is an improvement, but
    // upserting avoids the error entirely.
    await this.sequelize.query(
      `INSERT INTO inventory (id, vendor_listing_id, warehouse_id, quantity_available, quantity_reserved, created_at, updated_at)
       VALUES (gen_random_uuid(), :vendorListingId, NULL, :quantityAvailable, 0, now(), now())
       ON CONFLICT (vendor_listing_id) WHERE warehouse_id IS NULL
       DO UPDATE SET quantity_available = EXCLUDED.quantity_available,
                     updated_at = now()`,
      { replacements: { vendorListingId, quantityAvailable } },
    );

    return this.getOne(vendorId, vendorListingId);
  }

  async setStatus(
    vendorId: string,
    vendorListingId: string,
    status: VendorListingStatus,
  ): Promise<VendorListingStockDto> {
    const listing = await this.assertListingOwned(vendorId, vendorListingId);

    // Deliberately writes nothing but `status` — see rule 1 above.
    listing.status = status;
    await listing.save();

    return this.getOne(vendorId, vendorListingId);
  }

  // All-or-nothing by construction: ownership for the whole batch is
  // established before a single row is written, and the write itself is
  // ONE statement inside ONE transaction.
  //
  // The single statement matters beyond tidiness. The search-sync triggers
  // on `inventory` are FOR EACH STATEMENT with transition tables
  // (20260828090004), so a loop of 200 upserts enqueues 200 search_outbox
  // rows while one statement over 200 values enqueues exactly 1. Same
  // result, two orders of magnitude less reindex churn.
  async bulkSetStock(vendorId: string, dto: BulkSetStockDto): Promise<BulkStockResult> {
    // A body repeating the same listing twice is a caller mistake with no
    // single correct answer — "last one wins" would depend on array order,
    // which no client should have to reason about. Reject it by name.
    const seen = new Set<string>();
    const duplicated = new Set<string>();
    for (const item of dto.items) {
      if (seen.has(item.vendorListingId)) duplicated.add(item.vendorListingId);
      seen.add(item.vendorListingId);
    }
    if (duplicated.size > 0) {
      throw new BadRequestException(
        `the same listing appears more than once: ${[...duplicated].join(', ')}. Send one quantity per listing.`,
      );
    }

    const ids = dto.items.map((item) => item.vendorListingId);

    const owned = await this.vendorListingModel.findAll({
      where: { id: ids, vendorId },
      attributes: ['id', 'masterProductId'],
      include: [{ association: 'masterProduct', attributes: ['saleUnitType'] }],
    });

    // Unknown and not-yours are reported identically and together: telling
    // the caller which of their ids exist but belong to someone else would
    // leak the existence of another vendor's listings.
    const ownedIds = new Set(owned.map((listing) => listing.id));
    const rejected = ids.filter((id) => !ownedIds.has(id));
    if (rejected.length > 0) {
      throw new BadRequestException(
        `${rejected.length} listing id(s) are not yours or do not exist: ${rejected.join(', ')}. No stock was changed.`,
      );
    }

    const paint = owned.filter(
      (listing) => listing.masterProduct?.saleUnitType === SaleUnitType.TINTED_TO_ORDER,
    );
    if (paint.length > 0) {
      throw new BadRequestException(
        `${paint.length} listing(s) are tinted-to-order paint, which carries no stock (decision 0007): ${paint
          .map((listing) => listing.id)
          .join(', ')}. Use the status endpoint for paint availability. No stock was changed.`,
      );
    }

    // Sequelize's named-replacement binding does NOT turn a JS array into a
    // Postgres array literal -- it expands it as a comma-separated list of
    // scalars, which is exactly right for `IN (:list)` and exactly wrong
    // inside `CAST(:x AS uuid[])`. Verified directly against the running
    // app: that form produced `CAST('a', 'b' AS uuid[])`, a syntax error,
    // not the `ARRAY['a','b']` the unnest() call needs.
    //
    // Building the ARRAY[...] literal by hand with one named placeholder
    // per element keeps every value bound (no string concatenation of
    // user input into SQL) while producing syntax Postgres actually
    // accepts.
    const idPlaceholders = ids.map((_, i) => `:id${i}`).join(', ');
    const qtyPlaceholders = dto.items.map((_, i) => `:qty${i}`).join(', ');
    const replacements: Record<string, unknown> = {};
    ids.forEach((id, i) => (replacements[`id${i}`] = id));
    dto.items.forEach((item, i) => (replacements[`qty${i}`] = item.quantityAvailable));

    await this.sequelize.transaction(async (transaction) => {
      await this.sequelize.query(
        `INSERT INTO inventory (id, vendor_listing_id, warehouse_id, quantity_available, quantity_reserved, created_at, updated_at)
         SELECT gen_random_uuid(), t.listing_id, NULL, t.qty, 0, now(), now()
           FROM unnest(ARRAY[${idPlaceholders}]::uuid[], ARRAY[${qtyPlaceholders}]::numeric[]) AS t(listing_id, qty)
         ON CONFLICT (vendor_listing_id) WHERE warehouse_id IS NULL
         DO UPDATE SET quantity_available = EXCLUDED.quantity_available,
                       updated_at = now()`,
        { replacements, transaction },
      );
    });

    return { updatedCount: dto.items.length };
  }

  // 404 rather than 403 for another vendor's listing: a 403 would confirm
  // the id exists, which is information about a competitor's catalog.
  private async assertListingOwned(
    vendorId: string,
    vendorListingId: string,
  ): Promise<VendorListing> {
    const listing = await this.vendorListingModel.findOne({
      where: { id: vendorListingId, vendorId },
      include: [{ association: 'masterProduct', attributes: ['id', 'saleUnitType'] }],
    });

    if (!listing) {
      throw new NotFoundException(`listing ${vendorListingId} not found`);
    }

    return listing;
  }

  private async assertNotPaint(listing: VendorListing): Promise<void> {
    if (listing.masterProduct?.saleUnitType === SaleUnitType.TINTED_TO_ORDER) {
      throw new BadRequestException(
        'this listing is tinted-to-order paint, which carries no stock (decision 0007) — set its availability with the status endpoint instead',
      );
    }
  }

  private async getOne(vendorId: string, vendorListingId: string): Promise<VendorListingStockDto> {
    const page = await this.listForVendor(vendorId, {
      page: 1,
      limit: 1,
    } as ListVendorListingsQueryDto);
    const found = page.items.find((item) => item.vendorListingId === vendorListingId);
    if (found) return found;

    // The listing is known to exist and be owned (checked above), so a
    // miss here means it fell outside the first page of the default
    // ordering. Re-read it directly rather than paging.
    const rows = await this.sequelize.query<{
      vendor_listing_id: string;
      master_product_id: string;
      product_name: string;
      product_code: string;
      vendor_sku: string | null;
      stated_grade: string | null;
      price: string;
      mrp: string | null;
      status: string;
      quantity_available: string | null;
      sale_unit_type: string;
      updated_at: Date;
    }>(
      `SELECT
         vl.id AS vendor_listing_id, vl.master_product_id,
         mp.name AS product_name, mp.product_code,
         vl.vendor_sku, vl.stated_grade, vl.price, vl.mrp,
         vl.status::text AS status, inv.quantity_available,
         mp.sale_unit_type::text AS sale_unit_type, vl.updated_at
       FROM vendor_listing vl
       JOIN master_product mp ON mp.id = vl.master_product_id
       LEFT JOIN inventory inv
         ON inv.vendor_listing_id = vl.id AND inv.warehouse_id IS NULL
       WHERE vl.id = :vendorListingId AND vl.vendor_id = :vendorId`,
      { type: QueryTypes.SELECT, replacements: { vendorListingId, vendorId } },
    );

    const row = rows[0];
    if (!row) {
      throw new NotFoundException(`listing ${vendorListingId} not found`);
    }

    return {
      vendorListingId: row.vendor_listing_id,
      masterProductId: row.master_product_id,
      productName: row.product_name,
      productCode: row.product_code,
      vendorSku: row.vendor_sku,
      statedGrade: row.stated_grade,
      price: Number(row.price),
      mrp: row.mrp === null ? null : Number(row.mrp),
      status: row.status as VendorListingStockDto['status'],
      quantityAvailable: row.quantity_available === null ? null : Number(row.quantity_available),
      isPaint: row.sale_unit_type === SaleUnitType.TINTED_TO_ORDER,
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
