import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  HasMany,
} from 'sequelize-typescript';
import { literal } from 'sequelize';
import { Category } from './category.model';
import { ProductFamily } from './product-family.model';
import { Brand } from './brand.model';
import { StoneVariety } from './stone-variety.model';
import { UnitOfMeasure } from './unit-of-measure.model';
import { MasterProductAttributeValue } from './master-product-attribute-value.model';
import { MasterProductMedia } from './master-product-media.model';

export enum SaleUnitType {
  DISCRETE = 'discrete',
  CUT_TO_LENGTH = 'cut_to_length',
  TINTED_TO_ORDER = 'tinted_to_order',
}

export enum MasterProductStatus {
  DRAFT = 'draft',
  PENDING_REVIEW = 'pending_review',
  LIVE = 'live',
  DEPRECATED = 'deprecated',
}

// The master catalog (decisions 0001-0013). See docs/catalog-schema.sql
// section 6 for full column-by-column rationale.
//
// Two dedup constraints and two leaf-invariant triggers live in the
// migration, not here — they cross tables/columns in ways
// sequelize-typescript decorators cannot express:
//   - master_product_brand_mpn        (brand_id, mfr_part_number) partial unique
//   - master_product_generic_identity (category_id, identity_hash) partial unique
//   - trg_master_product_leaf_category / trg_category_leaf_transition
//
// attributes_flat and identity_hash are DB-trigger-maintained derived
// columns (follow-up migration) — treat them as read-only from application
// code; writing to them directly will be overwritten on the next attribute
// value change.
@Table({
  tableName: 'master_product',
  timestamps: true,
  underscored: true,
})
export class MasterProduct extends Model<MasterProduct> {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @ForeignKey(() => Category)
  @Column({
    type: DataType.UUID,
    allowNull: false,
    field: 'category_id',
  })
  declare categoryId: string;

  @ForeignKey(() => ProductFamily)
  @Column({
    type: DataType.UUID,
    allowNull: true,
    field: 'product_family_id',
  })
  declare productFamilyId: string | null;

  @ForeignKey(() => Brand)
  @Column({
    type: DataType.UUID,
    allowNull: true,
    field: 'brand_id',
  })
  declare brandId: string | null;

  @ForeignKey(() => StoneVariety)
  @Column({
    type: DataType.UUID,
    allowNull: true,
    field: 'stone_variety_id',
  })
  declare stoneVarietyId: string | null;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  declare name: string;

  @Column({
    type: DataType.STRING(280),
    allowNull: false,
    unique: true,
  })
  declare slug: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  declare description: string | null;

  // DB-generated via master_product_code_seq (decision 0011) — do not set
  // from application code except in tests. The defaultValue below is a
  // literal, evaluated by Postgres on INSERT, not a JS-side value: without
  // it, Sequelize's own not-null validation rejects a create() that omits
  // productCode before the query is ever sent, so the DB default is never
  // reached. Same class of bug as the created_at/updated_at lesson from
  // Phase 1 — a client-side default and a DB-side default are not
  // interchangeable, and this column needs the DB-side one specifically
  // because master_product_code_seq must stay a single, never-reused
  // sequence shared by every writer, not something each caller invents.
  @Column({
    type: DataType.STRING(16),
    allowNull: false,
    unique: true,
    field: 'product_code',
    defaultValue: literal("'GA-' || LPAD(nextval('master_product_code_seq')::text, 7, '0')"),
  })
  declare productCode: string;

  @Column({
    type: DataType.STRING(20),
    allowNull: true,
    unique: true,
  })
  declare gtin: string | null;

  @Column({
    type: DataType.STRING(64),
    allowNull: true,
    field: 'mfr_part_number',
  })
  declare mfrPartNumber: string | null;

  @Column({
    type: DataType.STRING(16),
    allowNull: true,
    field: 'hsn_code',
  })
  declare hsnCode: string | null;

  @Column({
    type: DataType.DECIMAL(5, 2),
    allowNull: false,
    defaultValue: 18.0,
    field: 'gst_rate',
  })
  declare gstRate: number;

  @Column({
    type: DataType.STRING(64),
    allowNull: false,
    defaultValue: 'India',
    field: 'country_of_origin',
  })
  declare countryOfOrigin: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
    field: 'importer_details',
  })
  declare importerDetails: string | null;

  @Column({
    type: DataType.ENUM(...Object.values(SaleUnitType)),
    allowNull: false,
    defaultValue: SaleUnitType.DISCRETE,
    field: 'sale_unit_type',
  })
  declare saleUnitType: SaleUnitType;

  @ForeignKey(() => UnitOfMeasure)
  @Column({
    type: DataType.UUID,
    allowNull: true,
    field: 'unit_of_measure_id',
  })
  declare unitOfMeasureId: string | null;

  @Column({
    type: DataType.DECIMAL(12, 3),
    allowNull: true,
    field: 'pack_content_qty',
  })
  declare packContentQty: number | null;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_generic',
  })
  declare isGeneric: boolean;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'has_natural_variation',
  })
  declare hasNaturalVariation: boolean;

  @Column({
    type: DataType.ENUM(...Object.values(MasterProductStatus)),
    allowNull: false,
    defaultValue: MasterProductStatus.DRAFT,
  })
  declare status: MasterProductStatus;

  // Trigger-maintained (follow-up migration) — read-only from app code.
  @Column({
    type: DataType.TEXT,
    allowNull: true,
    field: 'identity_hash',
  })
  declare identityHash: string | null;

  @Column({
    type: DataType.SMALLINT,
    allowNull: false,
    defaultValue: 1,
    field: 'identity_hash_version',
  })
  declare identityHashVersion: number;

  // Trigger-maintained (follow-up migration) — read-only from app code.
  @Column({
    type: DataType.JSONB,
    allowNull: false,
    defaultValue: {},
    field: 'attributes_flat',
  })
  declare attributesFlat: Record<string, string | number | boolean>;

  // Admin/ops visibility only — NOT the customer-facing price. See
  // search-system-design.md section 5 for the city-scoped figure.
  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: true,
    field: 'cached_best_price',
  })
  declare cachedBestPrice: number | null;

  @Column({
    type: DataType.UUID,
    allowNull: true,
    field: 'cached_best_vendor_listing_id',
  })
  declare cachedBestVendorListingId: string | null;

  @Column({
    type: DataType.DATE,
    allowNull: true,
    field: 'cached_updated_at',
  })
  declare cachedUpdatedAt: Date | null;

  @BelongsTo(() => Category)
  declare category?: Category;

  @BelongsTo(() => ProductFamily)
  declare productFamily?: ProductFamily;

  @BelongsTo(() => Brand)
  declare brand?: Brand;

  @BelongsTo(() => StoneVariety)
  declare stoneVariety?: StoneVariety;

  @BelongsTo(() => UnitOfMeasure)
  declare unitOfMeasure?: UnitOfMeasure;

  @HasMany(() => MasterProductAttributeValue)
  declare attributeValues?: MasterProductAttributeValue[];

  @HasMany(() => MasterProductMedia)
  declare media?: MasterProductMedia[];
}
