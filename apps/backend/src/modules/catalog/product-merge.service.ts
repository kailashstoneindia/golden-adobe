import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { QueryTypes, Transaction } from 'sequelize';
import type { MergeResultDto } from '@golden-abode/types';

import { CatalogMergeLog } from './models/catalog-merge-log.model';
import { MasterProduct, MasterProductStatus } from './models/master-product.model';
import { MasterProductMedia } from './models/master-product-media.model';
import { VendorListing, VendorListingStatus } from './models/vendor-listing.model';
import { VendorProductMap } from './models/vendor-product-map.model';
import { Vendor } from '../vendors/models/vendor.model';

const CLASH_REASON = 'The vendor already lists the product it was merged into';

// Decision 0063: fold a duplicate product into the one that stays, in one
// transaction with both product rows locked. Listings, vendor SKU mappings
// and (when the target has none) images move to the target. A vendor who
// lists both keeps the target listing; the source one would break the
// (vendor, product, grade) unique key, so it is paused on the source for
// review instead. Nothing is deleted, and past order lines keep pointing at
// the product the customer bought.
@Injectable()
export class ProductMergeService {
  private readonly logger = new Logger(ProductMergeService.name);

  constructor(
    @InjectModel(MasterProduct)
    private readonly productModel: typeof MasterProduct,
    @InjectModel(VendorListing)
    private readonly listingModel: typeof VendorListing,
    @InjectModel(VendorProductMap)
    private readonly mapModel: typeof VendorProductMap,
    @InjectModel(MasterProductMedia)
    private readonly mediaModel: typeof MasterProductMedia,
    @InjectModel(CatalogMergeLog)
    private readonly mergeLogModel: typeof CatalogMergeLog,
  ) {}

  private get sequelize() {
    return this.productModel.sequelize!;
  }

  async merge(adminUserId: string, fromId: string, intoId: string): Promise<MergeResultDto> {
    if (fromId === intoId) throw new BadRequestException('a product cannot be merged into itself');

    const result = await this.sequelize.transaction(async (transaction) => {
      const { from, into } = await this.lockPair(fromId, intoId, transaction);

      const { movedListings, pausedListings } = await this.moveListings(
        fromId,
        intoId,
        transaction,
      );
      const [movedMappings] = await this.mapModel.update(
        { masterProductId: intoId },
        { where: { masterProductId: fromId }, transaction },
      );
      const mediaMoved = await this.moveMediaIfTargetHasNone(fromId, intoId, transaction);

      await from.update(
        { status: MasterProductStatus.DEPRECATED, mergedIntoId: intoId, mergedAt: new Date() },
        { transaction },
      );
      await this.refreshBestPrice(into, transaction);

      const merged: MergeResultDto = { movedListings, movedMappings, mediaMoved, pausedListings };
      await this.mergeLogModel.create(
        {
          entityType: 'product',
          fromId,
          intoId,
          adminUserId,
          summary: {
            fromCode: from.productCode,
            intoCode: into.productCode,
            movedListings,
            movedMappings,
            mediaMoved,
            pausedListingIds: pausedListings.map((p) => p.listingId),
          },
        } as never,
        { transaction },
      );
      return merged;
    });

    this.logger.log(
      `admin ${adminUserId} merge product ${fromId} into ${intoId}: ` +
        `${result.movedListings} listings moved, ${result.pausedListings.length} paused`,
    );
    return result;
  }

  // Locked in id order so two opposite merges can't deadlock.
  private async lockPair(fromId: string, intoId: string, transaction: Transaction) {
    const locked = await this.productModel.findAll({
      where: { id: [fromId, intoId] },
      order: [['id', 'ASC']],
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    const from = locked.find((p) => p.id === fromId);
    const into = locked.find((p) => p.id === intoId);
    if (!from || !into) throw new NotFoundException('Product not found');
    if (from.categoryId !== into.categoryId) {
      throw new BadRequestException('Both products must be in the same category');
    }
    if (from.status === MasterProductStatus.DEPRECATED) {
      throw new BadRequestException(`${from.productCode} is retired and cannot be merged`);
    }
    if (into.status === MasterProductStatus.DEPRECATED) {
      throw new BadRequestException(`${into.productCode} is retired; pick a product that is not`);
    }
    return { from, into };
  }

  private async moveListings(fromId: string, intoId: string, transaction: Transaction) {
    const key = (l: VendorListing) => `${l.vendorId}|${l.statedGrade ?? ''}`;
    const onTarget = new Set(
      (
        await this.listingModel.findAll({
          where: { masterProductId: intoId },
          attributes: ['vendorId', 'statedGrade'],
          transaction,
        })
      ).map(key),
    );
    const onSource = await this.listingModel.findAll({
      where: { masterProductId: fromId },
      include: [{ model: Vendor, attributes: ['shopName'] }],
      lock: { level: transaction.LOCK.UPDATE, of: this.listingModel },
      transaction,
    });

    let movedListings = 0;
    const pausedListings: MergeResultDto['pausedListings'] = [];
    for (const listing of onSource) {
      if (onTarget.has(key(listing))) {
        if (listing.status !== VendorListingStatus.PAUSED) {
          await listing.update({ status: VendorListingStatus.PAUSED }, { transaction });
        }
        pausedListings.push({
          listingId: listing.id,
          vendorName: listing.vendor?.shopName ?? listing.vendorId,
          reason: CLASH_REASON,
        });
      } else {
        await listing.update({ masterProductId: intoId }, { transaction });
        onTarget.add(key(listing));
        movedListings++;
      }
    }
    return { movedListings, pausedListings };
  }

  private async moveMediaIfTargetHasNone(fromId: string, intoId: string, transaction: Transaction) {
    if (await this.mediaModel.count({ where: { masterProductId: intoId }, transaction })) {
      return false;
    }
    const [moved] = await this.mediaModel.update(
      { masterProductId: intoId },
      { where: { masterProductId: fromId }, transaction },
    );
    return moved > 0;
  }

  // The admin-visible cheapest active listing (master_product.cached_*).
  private async refreshBestPrice(product: MasterProduct, transaction: Transaction) {
    const [best] = await this.sequelize.query<{ id: string; price: string }>(
      `SELECT id, price FROM vendor_listing
        WHERE master_product_id = :id AND status = 'active'
        ORDER BY price ASC, created_at ASC
        LIMIT 1`,
      { replacements: { id: product.id }, type: QueryTypes.SELECT, transaction },
    );
    await product.update(
      {
        cachedBestPrice: best ? Number(best.price) : null,
        cachedBestVendorListingId: best?.id ?? null,
        cachedUpdatedAt: new Date(),
      },
      { transaction },
    );
  }
}
