import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import type { ProductReadinessCheck, ProductReadinessDto } from '@golden-abode/types';

import { CatalogAttributeResolverService } from './catalog-attribute-resolver.service';
import { MasterProduct } from './models/master-product.model';
import { MasterProductAttributeValue } from './models/master-product-attribute-value.model';
import {
  MasterProductMedia,
  MediaType,
  ProcessingStatus,
} from './models/master-product-media.model';
import { VendorListing, VendorListingStatus } from './models/vendor-listing.model';

// Same exclusion as the import template: country_of_origin is an identity
// column there, not an attribute column.
const GLOBAL_ATTRIBUTE_CODES_TO_SKIP = new Set(['country_of_origin']);

// What a product still needs before it can go live (decision 0063). Blocking
// checks stop publish; the others are warnings. The HSN code only warns until
// invoices exist; a product with no vendor listing yet can still be live.
@Injectable()
export class ProductReadinessService {
  constructor(
    @InjectModel(MasterProduct)
    private readonly productModel: typeof MasterProduct,
    @InjectModel(MasterProductMedia)
    private readonly mediaModel: typeof MasterProductMedia,
    @InjectModel(MasterProductAttributeValue)
    private readonly attributeValueModel: typeof MasterProductAttributeValue,
    @InjectModel(VendorListing)
    private readonly listingModel: typeof VendorListing,
    private readonly attributeResolver: CatalogAttributeResolverService,
  ) {}

  async getReadiness(productId: string): Promise<ProductReadinessDto> {
    const product = await this.productModel.findByPk(productId);
    if (!product) throw new NotFoundException('Product not found');

    const checks: ProductReadinessCheck[] = [
      await this.imageCheck(product.id),
      await this.requiredAttributesCheck(product),
      {
        code: 'hsn_code',
        label: 'HSN code',
        blocking: false,
        passed: Boolean(product.hsnCode),
        ...(product.hsnCode
          ? {}
          : { detail: 'Needed on invoices; publishing is allowed without it for now' }),
      },
      await this.listingCheck(product.id),
    ];

    return { ready: checks.every((c) => c.passed || !c.blocking), checks };
  }

  // A spec sheet is not a picture, and a failed upload has nothing to show.
  private async imageCheck(productId: string): Promise<ProductReadinessCheck> {
    const images = await this.mediaModel.count({
      where: {
        masterProductId: productId,
        type: MediaType.IMAGE,
        processingStatus: { [Op.ne]: ProcessingStatus.FAILED },
      },
    });
    return {
      code: 'image',
      label: 'At least one image',
      blocking: true,
      passed: images > 0,
      ...(images > 0 ? {} : { detail: 'needs at least one image' }),
    };
  }

  // The starred (variant-defining) attribute columns of the import template
  // for this product's category, each with a non-blank value.
  private async requiredAttributesCheck(product: MasterProduct): Promise<ProductReadinessCheck> {
    const blocks = await this.attributeResolver.resolveEffectiveAttributes(product.categoryId);
    const required = blocks.flatMap((block) =>
      block.attributes.filter(
        (a) =>
          a.isVariantDefining &&
          !(block.source === 'global' && GLOBAL_ATTRIBUTE_CODES_TO_SKIP.has(a.code)),
      ),
    );

    const values = await this.attributeValueModel.findAll({
      where: { masterProductId: product.id },
    });
    const filled = new Set(values.filter((v) => v.value?.trim()).map((v) => v.attributeId));
    const missing = required.filter((a) => !filled.has(a.id)).map((a) => a.name);

    return {
      code: 'required_attributes',
      label: 'Required attributes',
      blocking: true,
      passed: missing.length === 0,
      ...(missing.length ? { detail: `Missing: ${missing.join(', ')}` } : {}),
    };
  }

  private async listingCheck(productId: string): Promise<ProductReadinessCheck> {
    const active = await this.listingModel.count({
      where: { masterProductId: productId, status: VendorListingStatus.ACTIVE },
    });
    return {
      code: 'listing',
      label: 'At least one active vendor listing',
      blocking: false,
      passed: active > 0,
      ...(active > 0 ? {} : { detail: 'Customers can only buy it once a vendor lists it' }),
    };
  }
}
