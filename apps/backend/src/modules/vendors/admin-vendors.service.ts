import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
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
import {
  toFiniteNumber,
  toIsoDate,
  toNullableNumber,
} from '../../common/utils/display-number.util';
import { City } from '../catalog/models/city.model';
import { User } from '../users/models/user.model';
import { Vendor } from './models/vendor.model';
import { VendorAccountDetails } from './models/vendor-account-details.model';
import { toVendorProfileDto } from './vendor-profile.mapper';
import { UpdateAccountDetailsDto } from './dto/update-account-details.dto';
import { UpdateVendorProfileDto } from './dto/update-vendor-profile.dto';
import { VendorsService } from './vendors.service';

type ListingStatus = AdminVendorListingDto['status'];

// The admin's view of vendors (decision 0058 Task 5): the profile vendors
// see themselves, plus who owns it and what they sell. Counts come from one
// grouped query per kind across all vendors on the page, not a query per
// vendor. Admin-only: VendorsService keeps serving the vendor's own view.
@Injectable()
export class AdminVendorsService {
  private readonly logger = new Logger(AdminVendorsService.name);

  constructor(
    @InjectModel(Vendor) private readonly vendorModel: typeof Vendor,
    @InjectModel(VendorAccountDetails)
    private readonly accountDetailsModel: typeof VendorAccountDetails,
    private readonly vendorsService: VendorsService,
    private readonly sequelize: Sequelize,
  ) {}

  async list(): Promise<AdminVendorDto[]> {
    const vendors = await this.vendorModel.findAll({
      include: this.includes(),
      order: [
        ['createdAt', 'DESC'],
        ['id', 'ASC'],
      ],
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
    const rows = await this.listingRows(
      filter,
      'ORDER BY vl.created_at DESC, vl.id LIMIT :limit OFFSET :offset',
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

  // Decision 0058 Task 10. The vendor's own validators and update path are
  // reused (VendorsService), so an admin edit behaves exactly like the vendor's
  // own: coordinates move together, and an admin-pinned city stays pinned.
  async updateProfile(
    vendorId: string,
    adminUserId: string,
    dto: UpdateVendorProfileDto,
  ): Promise<AdminVendorDto> {
    rejectNulls(dto);
    const vendor = await this.vendorModel.findByPk(vendorId);
    if (!vendor) {
      throw new NotFoundException(`vendor ${vendorId} not found`);
    }
    const fields = changedProfileFields(vendor, dto);
    if (fields.length === 0) {
      return this.get(vendorId);
    }
    await this.vendorsService.updateProfile(vendor.userId, dto);
    this.logger.log(`admin ${adminUserId} update vendor ${vendorId} ${fields.join(',')}`);
    return this.get(vendorId);
  }

  // The bank record is replaced whole (the vendor's own rule: a half-updated
  // account is a failed payout). Only field names are logged, never numbers.
  async updateAccountDetails(
    vendorId: string,
    adminUserId: string,
    dto: UpdateAccountDetailsDto,
  ): Promise<AdminVendorDto> {
    const vendor = await this.vendorModel.findByPk(vendorId);
    if (!vendor) {
      throw new NotFoundException(`vendor ${vendorId} not found`);
    }
    const existing = await this.accountDetailsModel.findOne({ where: { vendorId } });
    const fields = BANK_FIELDS.filter((field) => !existing || existing[field] !== dto[field]);
    if (fields.length === 0) {
      return this.get(vendorId);
    }
    await this.vendorsService.updateAccountDetails(vendor.userId, dto);
    this.logger.log(`admin ${adminUserId} update vendor-bank ${vendorId} ${fields.join(',')}`);
    return this.get(vendorId);
  }

  // Pause a wrong or flagged listing, or bring one back. Stock is never
  // touched. A listing paused because the vendor has yet to confirm which
  // product it matches stays paused: publishing it would sell an unconfirmed
  // match.
  async setListingStatus(
    listingId: string,
    adminUserId: string,
    status: 'active' | 'paused',
  ): Promise<AdminVendorListingDto> {
    const [current] = await this.select<{ status: string; pending_matches: string }>(
      `SELECT status::text AS status, jsonb_array_length(match_candidates) AS pending_matches
         FROM vendor_listing WHERE id = :listingId`,
      { listingId },
    );
    if (!current) {
      throw new NotFoundException(`listing ${listingId} not found`);
    }
    if (current.status !== status) {
      if (status === 'active' && Number(current.pending_matches) > 0) {
        throw new ConflictException(
          'This listing is waiting for the vendor to confirm which product it matches, so it cannot be activated yet',
        );
      }
      await this.sequelize.query(
        `UPDATE vendor_listing SET status = :status, updated_at = now() WHERE id = :listingId`,
        { replacements: { status, listingId }, type: QueryTypes.UPDATE },
      );
      this.logger.log(
        `admin ${adminUserId} ${status === 'paused' ? 'pause' : 'reactivate'} vendor-listing ${listingId} status`,
      );
    }
    const [row] = await this.listingRows('vl.id = :listingId', '', { listingId });
    return toListingDto(row);
  }

  // One listing query for the list and for the reply to a status change, so
  // both always show the same fields.
  private listingRows(where: string, tail: string, replacements: Record<string, unknown>) {
    return this.select<ListingRow>(
      `SELECT vl.id, vl.master_product_id, mp.name AS product_name, mp.product_code,
              vl.vendor_sku, vl.price, vl.mrp, vl.min_order_qty, vl.stated_grade,
              vl.status::text AS status, inv.quantity_available, inv.quantity_reserved,
              vl.supports_tinting, mp.sale_unit_type::text AS sale_unit_type, uom.name AS unit,
              vl.created_at, vl.updated_at, inv.updated_at AS stock_updated_at,
              COALESCE(
                (SELECT json_agg(json_build_object('reason', f.reason, 'flaggedAt', f.flagged_at)
                                 ORDER BY f.flagged_at)
                   FROM vendor_listing_flag f
                  WHERE f.vendor_listing_id = vl.id AND f.resolved_at IS NULL),
                '[]'::json
              ) AS open_flags
         FROM vendor_listing vl
         JOIN master_product mp ON mp.id = vl.master_product_id
         LEFT JOIN unit_of_measure uom ON uom.id = mp.unit_of_measure_id
         LEFT JOIN inventory inv ON inv.vendor_listing_id = vl.id AND inv.warehouse_id IS NULL
        WHERE ${where}
        ${tail}`,
      replacements,
    );
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
      // The shared mapper passes the raw decimal string; the DTO type says number.
      minOrderValue: toNullableNumber(vendor.minOrderValue),
      owner: toAdminContactDto(vendor.user),
      citySource: vendor.citySource ?? null,
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
  supports_tinting: boolean | null;
  sale_unit_type: string | null;
  unit: string | null;
  created_at: Date;
  updated_at: Date;
  stock_updated_at: Date | null;
  open_flags: { reason: string; flaggedAt: string }[];
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
    supportsTinting: Boolean(row.supports_tinting),
    saleUnitType: row.sale_unit_type,
    unit: row.unit,
    openFlags: row.open_flags.map((flag) => ({
      reason: flag.reason,
      flaggedAt: toIsoDate(flag.flaggedAt),
    })),
    createdAt: toIsoDate(row.created_at),
    updatedAt: toIsoDate(row.updated_at),
    stockUpdatedAt: row.stock_updated_at ? toIsoDate(row.stock_updated_at) : null,
  };
}

const BANK_FIELDS = [
  'accountHolderName',
  'bankName',
  'ifscCode',
  'branchName',
  'accountNumber',
] as const;

// JSON null would mean "erase", which no field here supports: leave a field
// out to leave it alone.
function rejectNulls(dto: object): void {
  for (const [field, value] of Object.entries(dto)) {
    if (value === null) {
      throw new BadRequestException(`${field} cannot be null; leave it out to keep it unchanged`);
    }
  }
}

// Names of the profile fields the request would actually change.
function changedProfileFields(vendor: Vendor, dto: UpdateVendorProfileDto): string[] {
  const changed: string[] = [];
  for (const field of [
    'shopName',
    'address',
    'upiId',
    'bankDetails',
    'gstin',
    'hasLoadingUnloadingTeam',
  ] as const) {
    if (dto[field] !== undefined && dto[field] !== vendor[field]) changed.push(field);
  }
  if (
    dto.minOrderValue !== undefined &&
    Number(dto.minOrderValue) !== Number(vendor.minOrderValue)
  ) {
    changed.push('minOrderValue');
  }
  if (
    (dto.latitude !== undefined && Number(dto.latitude) !== Number(vendor.latitude)) ||
    (dto.longitude !== undefined && Number(dto.longitude) !== Number(vendor.longitude))
  ) {
    changed.push('latitude', 'longitude');
  }
  return changed;
}
