import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { UnitOfMeasure } from './models/unit-of-measure.model';
import { HsnCode } from './models/hsn-code.model';
import { Brand } from './models/brand.model';
import { BrandAlias } from './models/brand-alias.model';
import { Category } from './models/category.model';
import { VendorCategory } from './models/vendor-category.model';
import { Attribute } from './models/attribute.model';
import { AttributeValueOption } from './models/attribute-value-option.model';
import { StoneVariety } from './models/stone-variety.model';
import { StoneVarietyAlias } from './models/stone-variety-alias.model';
import { ProductFamily } from './models/product-family.model';
import { MasterProduct } from './models/master-product.model';
import { MasterProductAttributeValue } from './models/master-product-attribute-value.model';
import { MasterProductMedia } from './models/master-product-media.model';
import { CatalogReindexQueue } from './models/catalog-reindex-queue.model';
import { Warehouse } from './models/warehouse.model';
import { VendorListing } from './models/vendor-listing.model';
import { VendorListingFlag } from './models/vendor-listing-flag.model';
import { VendorListingColourPrice } from './models/vendor-listing-colour-price.model';
import { Inventory } from './models/inventory.model';
import { VendorProductMap } from './models/vendor-product-map.model';
import { CatalogImportBatch } from './models/catalog-import-batch.model';
import { CatalogImportRow } from './models/catalog-import-row.model';
import { City } from './models/city.model';
import { PincodeCityMap } from './models/pincode-city-map.model';
import { Vendor } from '../vendors/models/vendor.model';
import { CityResolverService } from './city-resolver.service';
import { BrandResolverService } from './brand-resolver.service';
import { CatalogAttributeResolverService } from './catalog-attribute-resolver.service';
import { CatalogImportTemplateService } from './catalog-import-template.service';
import { CatalogImportUploadService } from './catalog-import-upload.service';
import { CatalogImportController } from './catalog-import.controller';
import { VendorMatchLadderService } from './vendor-match-ladder.service';
import { VendorCatalogExportService } from './vendor-catalog-export.service';
import { VendorCatalogImportService } from './vendor-catalog-import.service';
import { VendorCatalogImportController } from './vendor-catalog-import.controller';
import { CatalogReviewQueueController } from './catalog-review-queue.controller';
import { AdminCatalogController } from './admin-catalog.controller';
import { AdminCatalogService } from './admin-catalog.service';

// Phase 1 (taxonomy) + Phase 2 (master catalog, incl. the attributes_flat /
// identity_hash trigger layer) + Phase 3 (admin catalog import) + Phase 4
// (vendor listings, inventory, import staging, match ladder, export/upload
// endpoints, admin review queue) per catalog-build-order.md. Phase 4 is now
// feature-complete end to end: a vendor can download a scoped export,
// upload it, get deterministic matches live immediately and uncertain ones
// paused pending their own confirmation, and an admin can work the
// needs_review queue.
//
// attributes_flat / identity_hash maintenance, the enum-value-validity
// guard, and the reindex-queue enqueue trigger are DB triggers (see
// 20260826090000-create-attributes-flat-triggers.js) — not application
// code.
//
// Deliberately NOT built: promoting a review-queue row into a brand-new
// draft product (Flow 3 outcome 2) — reuses Phase 3's product-creation path
// and is a natural follow-up once the review queue has real data to
// exercise it against, not a gap in the design.
//
// Phase 6a/6b (geography + document shape, decisions 0018/0019/0020):
// city, pincode_city_map, vendors.city_id, and CityResolverService
// (pincode + GPS combined, coordinates win on disagreement). search_outbox
// and its 26 sync triggers are schema-only at this point (see
// 20260828090003-4-5 migrations) — the Meilisearch client, the BullMQ
// worker that drains the outbox, and the query layer (6c/6e-6h) are a
// deliberate follow-up, not implemented here.
//
// Phase 7 (integrity hardening, catalog-integrity-residual-risks.md):
// BrandResolverService + BrandAlias (risk 1 — duplicate brand rows defeat
// the primary dedup constraint silently), required-variant-attrs-at-publish
// trigger scoped to identity-hash-dependent products (risk 3 — Stone/
// Hardware's only protection), vendor_listing_price_outliers view (price-
// outlier flag, flag-for-review not auto-unpublish), vendor_listing_flag +
// catalog-edit re-validation trigger, and the pending-confirmation
// alternatives/differing-attributes surfaced by
// VendorCatalogImportService.listPendingConfirmations +
// choosePendingListingCandidate (risk 2 — a single yes/no button invites a
// reflexive confirm). Risk 4 (customer report path) stays out of scope —
// blocked on the ordering domain, which doesn't exist yet.
@Module({
  imports: [
    SequelizeModule.forFeature([
      UnitOfMeasure,
      HsnCode,
      Brand,
      BrandAlias,
      Category,
      VendorCategory,
      Attribute,
      AttributeValueOption,
      StoneVariety,
      StoneVarietyAlias,
      ProductFamily,
      MasterProduct,
      MasterProductAttributeValue,
      MasterProductMedia,
      CatalogReindexQueue,
      Warehouse,
      VendorListing,
      VendorListingFlag,
      VendorListingColourPrice,
      Inventory,
      VendorProductMap,
      CatalogImportBatch,
      CatalogImportRow,
      City,
      PincodeCityMap,
      Vendor,
    ]),
  ],
  controllers: [
    CatalogImportController,
    VendorCatalogImportController,
    CatalogReviewQueueController,
    AdminCatalogController,
  ],
  providers: [
    CatalogAttributeResolverService,
    CatalogImportTemplateService,
    CatalogImportUploadService,
    VendorMatchLadderService,
    VendorCatalogExportService,
    VendorCatalogImportService,
    CityResolverService,
    BrandResolverService,
    AdminCatalogService,
  ],
  exports: [
    SequelizeModule,
    CatalogAttributeResolverService,
    VendorMatchLadderService,
    CityResolverService,
    BrandResolverService,
  ],
})
export class CatalogModule {}
