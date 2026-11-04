import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import {
  AdminVendorDto,
  AdminVendorListingDto,
  AdminWarehouseDto,
  PaginatedAdminVendorListingsResponse,
} from '@golden-abode/types';

import {
  ADMIN_CONTACT_ATTRIBUTES,
  toAdminContactDto,
} from '../../common/mappers/admin-contact.mapper';
import { toFiniteNumber, toIsoDate } from '../../common/utils/display-number.util';
import { City } from '../catalog/models/city.model';
import { User } from '../users/models/user.model';
import { Vendor } from './models/vendor.model';
import { VendorAccountDetails } from './models/vendor-account-details.model';
import { toVendorProfileDto } from './vendor-profile.mapper';

type ListingStatus = AdminVendorListingDto['status'];

// The admin's view of vendors (decision 0058 Task 5): the profile vendors
// see themselves, plus who owns it and what they sell. Counts come from one
// grouped query per kind across all vendors on the page, not a query per
// vendor. Admin-only: VendorsService keeps serving the vendor's own view.
@Injectable()
export class AdminVendorsService {
  constructor(
    @InjectModel(Vendor) private readonly vendorModel: typeof Vendor,
    private readonly sequelize: Sequelize,
  ) {}

  async list(): Promise<AdminVendorDto[]> {
    const vendors = await this.vendorModel.findAll({
      include: this.includes(),
      order: [['createdAt', 'DESC']],
    });
    return this.withFacts(vendors);
  }

  async get(vendorId: string): Promise<AdminVendorDto> {
    const vendor = await this.vendorModel.findByPk(vendorId, { include: this.includes() });
    if (!vendor) {
      throw new NotFoundException(`vendor ${vendorId} not found`);
    }
    const [dto] = await this.withFacts([vendor]);
    return dto;
  }

  async listListings(
    vendorId: string,
    query: { status?: ListingStatus; page: number; limit: number },
  ): Promise<PaginatedAdminVendorListingsResponse> {
    const exists = await this.vendorModel.findByPk(vendorId, { attributes: ['id'] });
    if (!exists) {
      throw new NotFoundException(`vendor ${vendorId} not found`);
    }
    const replacements = {
      vendorId,
      status: query.status ?? null,
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
    };
    const filter =
      'vl.vendor_id = :vendorId AND (:status::text IS NULL OR vl.status::text = :status)';
    const [{ total }] = await this.select<{ total: string }>(
      `SELECT count(*) AS total FROM vendor_listing vl WHERE ${filter}`,
      replacements,
    );
    const rows = await this.select<ListingRow>(
      `SELECT vl.id, vl.master_product_id, mp.name AS product_name, mp.product_code,
              vl.vendor_sku, vl.price, vl.mrp, vl.min_order_qty, vl.stated_grade,
              vl.status::text AS status, inv.quantity_available, inv.quantity_reserved,
              vl.updated_at,
              COALESCE(
                (SELECT array_agg(f.reason ORDER BY f.flagged_at)
                   FROM vendor_listing_flag f
                  WHERE f.vendor_listing_id = vl.id AND f.resolved_at IS NULL),
                '{}'
              ) AS open_flags
         FROM vendor_listing vl
         JOIN master_product mp ON mp.id = vl.master_product_id
         LEFT JOIN inventory inv ON inv.vendor_listing_id = vl.id AND inv.warehouse_id IS NULL
        WHERE ${filter}
        ORDER BY vl.created_at DESC, vl.id
        LIMIT :limit OFFSET :offset`,
      replacements,
    );
    const count = Number(total);
    return {
      items: rows.map(toListingDto),
      total: count,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(count / query.limit) || 1,
    };
  }

  private includes() {
    // A new User include per call: Sequelize writes into include objects.
    return [VendorAccountDetails, City, { model: User, attributes: [...ADMIN_CONTACT_ATTRIBUTES] }];
  }

  private async withFacts(vendors: Vendor[]): Promise<AdminVendorDto[]> {
    if (vendors.length === 0) return [];
    const vendorIds = vendors.map((vendor) => vendor.id);
    const [listings, flags, categories, groups, warehouses] = await Promise.all([
      this.select<{ vendor_id: string; status: string; n: string }>(
        `SELECT vendor_id, status::text AS status, count(*) AS n FROM vendor_listing
          WHERE vendor_id IN (:vendorIds) GROUP BY vendor_id, status`,
        { vendorIds },
      ),
      this.select<{ vendor_id: string; n: string }>(
        `SELECT vl.vendor_id, count(*) AS n FROM vendor_listing_flag f
           JOIN vendor_listing vl ON vl.id = f.vendor_listing_id
          WHERE vl.vendor_id IN (:vendorIds) AND f.resolved_at IS NULL GROUP BY vl.vendor_id`,
        { vendorIds },
      ),
      this.select<{ vendor_id: string; n: string }>(
        `SELECT vendor_id, count(*) AS n FROM vendor_category
          WHERE vendor_id IN (:vendorIds) GROUP BY vendor_id`,
        { vendorIds },
      ),
      this.select<{ vendor_id: string; n: string }>(
        `SELECT vendor_id, count(*) AS n FROM order_vendor_group
          WHERE vendor_id IN (:vendorIds) GROUP BY vendor_id`,
        { vendorIds },
      ),
      this.select<WarehouseRow>(
        `SELECT id, vendor_id, name, address, is_active FROM warehouse
          WHERE vendor_id IN (:vendorIds) ORDER BY name`,
        { vendorIds },
      ),
    ]);

    const countOf = (rows: { vendor_id: string; n: string }[], vendorId: string) =>
      Number(rows.find((row) => row.vendor_id === vendorId)?.n ?? 0);
    const listingsOf = (vendorId: string, status: string) =>
      Number(listings.find((row) => row.vendor_id === vendorId && row.status === status)?.n ?? 0);

    return vendors.map((vendor) => ({
      ...toVendorProfileDto(vendor),
      owner: toAdminContactDto(vendor.user),
      categoryCount: countOf(categories, vendor.id),
      listingCounts: {
        active: listingsOf(vendor.id, 'active'),
        paused: listingsOf(vendor.id, 'paused'),
        outOfStock: listingsOf(vendor.id, 'out_of_stock'),
      },
      openFlagCount: countOf(flags, vendor.id),
      orderGroupCount: countOf(groups, vendor.id),
      warehouses: warehouses
        .filter((row) => row.vendor_id === vendor.id)
        .map(
          (row): AdminWarehouseDto => ({
            id: row.id,
            name: row.name,
            address: row.address,
            isActive: row.is_active,
          }),
        ),
    }));
  }

  private select<T extends object>(sql: string, replacements: Record<string, unknown>) {
    return this.sequelize.query<T>(sql, { replacements, type: QueryTypes.SELECT });
  }
}

type WarehouseRow = {
  id: string;
  vendor_id: string;
  name: string;
  address: string | null;
  is_active: boolean;
};

type ListingRow = {
  id: string;
  master_product_id: string;
  product_name: string;
  product_code: string | null;
  vendor_sku: string | null;
  price: string;
  mrp: string | null;
  min_order_qty: string | null;
  stated_grade: string | null;
  status: ListingStatus;
  quantity_available: string | null;
  quantity_reserved: string | null;
  updated_at: Date;
  open_flags: string[];
};

function toListingDto(row: ListingRow): AdminVendorListingDto {
  const nullableNumber = (value: string | null) => (value == null ? null : toFiniteNumber(value));
  return {
    id: row.id,
    masterProductId: row.master_product_id,
    productName: row.product_name,
    productCode: row.product_code,
    vendorSku: row.vendor_sku,
    price: toFiniteNumber(row.price),
    mrp: nullableNumber(row.mrp),
    minOrderQty: nullableNumber(row.min_order_qty),
    statedGrade: row.stated_grade,
    status: row.status,
    quantityAvailable: nullableNumber(row.quantity_available),
    quantityReserved: nullableNumber(row.quantity_reserved),
    openFlags: row.open_flags,
    updatedAt: toIsoDate(row.updated_at),
  };
}
