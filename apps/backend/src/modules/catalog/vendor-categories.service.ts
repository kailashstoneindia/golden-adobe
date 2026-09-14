import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Op } from 'sequelize';
import { VendorCategoryDto } from '@golden-abode/types';

import { Vendor } from '../vendors/models/vendor.model';
import { VendorCategory } from './models/vendor-category.model';
import { Category } from './models/category.model';

@Injectable()
export class VendorCategoriesService {
  private readonly logger = new Logger(VendorCategoriesService.name);

  constructor(
    @InjectModel(VendorCategory)
    private readonly vendorCategoryModel: typeof VendorCategory,
    @InjectModel(Category)
    private readonly categoryModel: typeof Category,
    @InjectModel(Vendor)
    private readonly vendorModel: typeof Vendor,
    private readonly sequelize: Sequelize,
  ) {}

  async listForVendor(vendorId: string): Promise<VendorCategoryDto[]> {
    const rows = await this.vendorCategoryModel.findAll({ where: { vendorId } });
    if (rows.length === 0) {
      return [];
    }

    const categories = await this.categoryModel.findAll({
      where: { id: { [Op.in]: rows.map((row) => row.categoryId) } },
      order: [['path', 'ASC']],
    });

    return categories.map((category) => ({
      categoryId: category.id,
      name: category.name,
      path: category.path,
      level: category.level,
    }));
  }

  // Full replace inside a transaction. Delete-then-insert rather than a
  // diff: the table is a composite-PK join with no payload columns, so
  // there is nothing to preserve on a surviving row, and a partial
  // failure that left a vendor registered for half a set would silently
  // change their export scope.
  async replaceForVendor(vendorId: string, categoryIds: string[]): Promise<VendorCategoryDto[]> {
    await this.assertVendorExists(vendorId);

    // Deduplicate before validating: a body repeating the same id is a
    // caller mistake, not a reason to fail, but it WOULD trip the
    // composite primary key on bulkCreate.
    const uniqueIds = [...new Set(categoryIds)];

    if (uniqueIds.length > 0) {
      await this.assertAllLeafCategories(uniqueIds);
    }

    await this.sequelize.transaction(async (transaction) => {
      await this.vendorCategoryModel.destroy({ where: { vendorId }, transaction });

      if (uniqueIds.length > 0) {
        await this.vendorCategoryModel.bulkCreate(
          uniqueIds.map((categoryId) => ({ vendorId, categoryId })) as any,
          { transaction },
        );
      }
    });

    if (uniqueIds.length === 0) {
      // Worth a log line: under the Option A fallback below, clearing a
      // vendor's categories WIDENS their export scope to unrestricted.
      this.logger.warn(
        `vendor ${vendorId} now has zero registered categories — export scoping is unrestricted for them under the current fallback`,
      );
    }

    return this.listForVendor(vendorId);
  }

  // ---------------------------------------------------------------------
  // Export scope enforcement (the control decision 0011 and the export
  // Swagger both describe, which until now did not exist in code).
  //
  // FALLBACK, DELIBERATE: a vendor with zero registered categories is
  // treated as unrestricted rather than as "permitted nothing". Every
  // existing vendor has zero rows today, so failing closed would break all
  // exports the moment this shipped. This is the agreed Option A.
  //
  // TODO(phase-2): once vendor_category is backfilled for all live
  // vendors, delete the empty-set branch so an unregistered vendor is
  // denied instead of unrestricted. That flip is the difference between
  // this being a real control and a formality — it is not done here only
  // because the data is not ready.
  // ---------------------------------------------------------------------
  async assertExportScopeAllowed(vendorId: string, requestedCategoryIds: string[]): Promise<void> {
    const registered = await this.vendorCategoryModel.findAll({ where: { vendorId } });

    if (registered.length === 0) {
      this.logger.warn(
        `vendor ${vendorId} has no registered categories — allowing unrestricted export scope (Option A fallback)`,
      );
      return;
    }

    const registeredIds = new Set(registered.map((row) => row.categoryId));
    const notRegistered = requestedCategoryIds.filter((id) => !registeredIds.has(id));

    if (notRegistered.length === 0) {
      return;
    }

    // Reject naming the offending categories rather than silently
    // narrowing the scope: a vendor who asked for five categories and
    // received three would have no way to tell that happened, and would
    // read the short export as "the catalog has nothing for me".
    const names = await this.categoryModel.findAll({
      where: { id: { [Op.in]: notRegistered } },
    });
    const labels = notRegistered.map((id) => {
      const match = names.find((category) => category.id === id);
      return match ? `${match.name} (${id})` : id;
    });

    throw new BadRequestException(
      `not registered for ${notRegistered.length === 1 ? 'category' : 'categories'}: ${labels.join(', ')}. Ask an admin to register your shop for these categories before exporting them.`,
    );
  }

  private async assertVendorExists(vendorId: string): Promise<void> {
    const vendor = await this.vendorModel.findByPk(vendorId);
    if (!vendor) {
      throw new NotFoundException(`vendor ${vendorId} not found`);
    }
  }

  // Products attach only to leaf categories (decision 0001), so
  // registering a vendor for a branch would produce an export scope that
  // matches no products at all — a silently empty sheet rather than an
  // error. Both failure modes are reported separately because they need
  // different fixes: a bad id is a caller bug, a non-leaf id is a caller
  // misunderstanding of the tree.
  private async assertAllLeafCategories(categoryIds: string[]): Promise<void> {
    const found = await this.categoryModel.findAll({
      where: { id: { [Op.in]: categoryIds } },
    });

    const foundIds = new Set(found.map((category) => category.id));
    const missing = categoryIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(`unknown category ${missing.length === 1 ? 'id' : 'ids'}: ${missing.join(', ')}`);
    }

    const nonLeaf = found.filter((category) => !category.isLeaf);
    if (nonLeaf.length > 0) {
      throw new BadRequestException(
        `not leaf categories (products only attach to leaves): ${nonLeaf
          .map((category) => `${category.name} (${category.id})`)
          .join(', ')}`,
      );
    }
  }
}
