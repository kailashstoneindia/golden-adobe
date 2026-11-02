import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { VendorListingStockDto } from '@golden-abode/types';

import { MasterProduct, MasterProductStatus, SaleUnitType } from './models/master-product.model';
import { VendorListing, VendorListingStatus } from './models/vendor-listing.model';
import { VendorCategoriesService } from './vendor-categories.service';
import { StockService } from './stock.service';
import { CreateVendorListingDto } from './dto/create-vendor-listing.dto';

// Decision 0053 — a vendor creating ONE listing against an existing, live
// master_product. Separate from StockService (which owns mutating an
// EXISTING listing's stock/status) because this answers a different
// question: whether this listing should exist at all.
//
// Deliberately NOT routed through VendorMatchLadderService: that resolves
// AMBIGUOUS free text from a bulk-upload spreadsheet cell. A vendor calling
// this endpoint already picked an exact masterProductId (via
// VendorCatalogSearchService's search results), so there is nothing
// ambiguous to resolve — the listing is always created ACTIVE, never
// PAUSED pending confirmation.
@Injectable()
export class VendorListingsService {
  constructor(
    @InjectModel(MasterProduct)
    private readonly masterProductModel: typeof MasterProduct,
    @InjectModel(VendorListing)
    private readonly vendorListingModel: typeof VendorListing,
    private readonly vendorCategories: VendorCategoriesService,
    private readonly stockService: StockService,
    private readonly sequelize: Sequelize,
  ) {}

  async createListing(
    vendorId: string,
    dto: CreateVendorListingDto,
  ): Promise<VendorListingStockDto> {
    const product = await this.masterProductModel.findByPk(dto.masterProductId);
    if (!product) {
      throw new NotFoundException(`master product ${dto.masterProductId} not found`);
    }
    if (product.status !== MasterProductStatus.LIVE) {
      throw new BadRequestException(
        `master product ${dto.masterProductId} is "${product.status}", not "live" — you can only list against live products`,
      );
    }

    // Same check export already applies (vendor-categories.service.ts
    // assertCategoryScopeAllowed, renamed from assertExportScopeAllowed
    // when this call site was added) — one rule for "is this vendor
    // allowed to touch this category," reused rather than a second,
    // differently-behaved copy. Currently a no-op for every vendor (zero
    // vendor_category rows backfilled), same as export, until that
    // backfill lands.
    await this.vendorCategories.assertCategoryScopeAllowed(vendorId, [product.categoryId]);

    const isPaint = product.saleUnitType === SaleUnitType.TINTED_TO_ORDER;
    if (isPaint && dto.initialQuantityAvailable !== undefined) {
      throw new BadRequestException(
        'this product is tinted-to-order paint, which carries no stock (decision 0007) — omit initialQuantityAvailable and use the status endpoint for availability instead',
      );
    }

    // Listing creation and its initial stock write (when given) happen in
    // ONE transaction: without this, the stock write failing after the
    // listing INSERT already committed would leave an orphaned active
    // listing with no stock row and no way to discover it short of a
    // separate GET /vendor/listings call.
    try {
      return await this.sequelize.transaction(async (transaction) => {
        const listing = await this.vendorListingModel.create(
          {
            vendorId,
            masterProductId: dto.masterProductId,
            vendorSku: dto.vendorSku ?? null,
            price: dto.price,
            mrp: dto.mrp ?? null,
            minOrderQty: dto.minOrderQty ?? 1,
            statedGrade: dto.statedGrade ?? null,
            supportsTinting: isPaint,
            status: VendorListingStatus.ACTIVE,
          } as never,
          { transaction },
        );

        if (!isPaint && dto.initialQuantityAvailable !== undefined) {
          return this.stockService.setStock(
            vendorId,
            listing.id,
            dto.initialQuantityAvailable,
            transaction,
          );
        }

        return this.stockService.getOne(vendorId, listing.id, transaction);
      });
    } catch (err) {
      throw await this.translateWriteError(err, vendorId, dto);
    }
  }

  // Mirrors AdminCatalogService.translateWriteError's shape: Sequelize puts
  // the real Postgres constraint/index name on .parent.constraint, not in
  // .message, for a unique violation. vendor_listing_unique has no payload
  // columns to diff, so on a genuine duplicate the existing row IS the
  // answer — look it up and name its id, rather than a bare "already
  // exists."
  private async translateWriteError(
    err: unknown,
    vendorId: string,
    dto: CreateVendorListingDto,
  ): Promise<Error> {
    const constraint =
      (err as { parent?: { constraint?: string }; original?: { constraint?: string } })?.parent
        ?.constraint ??
      (err as { original?: { constraint?: string } })?.original?.constraint ??
      null;

    if (constraint === 'vendor_listing_unique') {
      const existing = await this.vendorListingModel.findOne({
        where: {
          vendorId,
          masterProductId: dto.masterProductId,
          statedGrade: dto.statedGrade ?? null,
        } as never,
      });
      return new ConflictException(
        existing
          ? `you already have a listing for this product${dto.statedGrade ? ` at grade "${dto.statedGrade}"` : ''} (vendor_listing ${existing.id}) — update it instead of creating a new one`
          : 'you already have a listing for this product and grade',
      );
    }

    return err instanceof Error ? err : new Error(String(err));
  }
}
