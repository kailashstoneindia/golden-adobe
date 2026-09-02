import { Sequelize } from 'sequelize-typescript';

import { UnitOfMeasure } from '../models/unit-of-measure.model';
import { HsnCode } from '../models/hsn-code.model';
import { Brand } from '../models/brand.model';
import { BrandAlias } from '../models/brand-alias.model';
import { Category } from '../models/category.model';
import { VendorCategory } from '../models/vendor-category.model';
import { Attribute } from '../models/attribute.model';
import { AttributeValueOption } from '../models/attribute-value-option.model';
import { StoneVariety } from '../models/stone-variety.model';
import { StoneVarietyAlias } from '../models/stone-variety-alias.model';
import { ProductFamily } from '../models/product-family.model';
import { MasterProduct } from '../models/master-product.model';
import { MasterProductAttributeValue } from '../models/master-product-attribute-value.model';
import { MasterProductMedia } from '../models/master-product-media.model';
import { CatalogReindexQueue } from '../models/catalog-reindex-queue.model';
import { Warehouse } from '../models/warehouse.model';
import { VendorListing } from '../models/vendor-listing.model';
import { VendorListingFlag } from '../models/vendor-listing-flag.model';
import { VendorListingColourPrice } from '../models/vendor-listing-colour-price.model';
import { Inventory } from '../models/inventory.model';
import { VendorProductMap } from '../models/vendor-product-map.model';
import { CatalogImportBatch } from '../models/catalog-import-batch.model';
import { CatalogImportRow } from '../models/catalog-import-row.model';
import { City } from '../models/city.model';
import { PincodeCityMap } from '../models/pincode-city-map.model';
import { Vendor } from '../../vendors/models/vendor.model';
import { VendorAccountDetails } from '../../vendors/models/vendor-account-details.model';
import { User } from '../../users/models/user.model';
import { RefreshToken } from '../../users/models/refresh-token.model';

// Shared model list for catalog integration tests — every model any of the
// above associates with must be present, or sequelize-typescript throws
// "X has not been defined" at connection time. Kept in one place so a new
// association doesn't mean updating N test files.
export const CATALOG_TEST_MODELS = [
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
  User,
  VendorAccountDetails,
  RefreshToken,
];

// Integration tests run against a REAL Postgres database (golden_abode_test
// by default), not mocks — deliberately: a large share of what this catalog
// does is only correct because of real Postgres behaviour (dedup
// constraints, the attributes_flat/identity_hash triggers, pg_trgm fuzzy
// matching). A mocked model would happily accept whatever the test told it
// was true, which is exactly the class of bug this session's manual testing
// caught twice (the product_code default, the vendor_product_map key).
//
// Requires Postgres reachable and golden_abode_test migrated — see
// apps/backend/database/config.js "test" entry. Run migrations against it
// with: NODE_ENV=test npx sequelize-cli db:migrate
export function createTestSequelize(): Sequelize {
  return new Sequelize({
    dialect: 'postgres',
    host: process.env.TEST_DB_HOST ?? '127.0.0.1',
    port: Number(process.env.TEST_DB_PORT ?? 5432),
    username: process.env.TEST_DB_USER ?? 'postgres',
    password: process.env.TEST_DB_PASS ?? 'postgres',
    database: process.env.TEST_DB_NAME ?? 'golden_abode_test',
    logging: false,
    models: CATALOG_TEST_MODELS,
  });
}
