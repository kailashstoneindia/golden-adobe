import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  HasMany,
} from 'sequelize-typescript';
import { Vendor } from '../../vendors/models/vendor.model';
import { MasterProduct } from './master-product.model';
import { VendorListingColourPrice } from './vendor-listing-colour-price.model';
import { Inventory } from './inventory.model';
import { ImportMatchCandidate } from './catalog-import-row.model';

export enum VendorListingStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  OUT_OF_STOCK = 'out_of_stock',
}

// One listing per vendor per product PER GRADE (decision 0009) — enforced
// by a partial-COALESCE unique index in the migration
// (vendor_listing_unique), not here; sequelize-typescript decorators can't
// express a COALESCE-based uniqueness rule.
@Table({
  tableName: 'vendor_listing',
  timestamps: true,
  underscored: true,
})
export class VendorListing extends Model<VendorListing> {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @ForeignKey(() => Vendor)
  @Column({
    type: DataType.UUID,
    allowNull: false,
    field: 'vendor_id',
  })
  declare vendorId: string;

  @ForeignKey(() => MasterProduct)
  @Column({
    type: DataType.UUID,
    allowNull: false,
    field: 'master_product_id',
  })
  declare masterProductId: string;

  @Column({
    type: DataType.STRING(64),
    allowNull: true,
    field: 'vendor_sku',
  })
  declare vendorSku: string | null;

  // Untinted price for tinted-to-order paint; the colour-family price lives
  // in VendorListingColourPrice.
  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: false,
  })
  declare price: number;

  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: true,
  })
  declare mrp: number | null;

  @Column({
    type: DataType.DECIMAL(12, 3),
    allowNull: false,
    defaultValue: 1,
    field: 'min_order_qty',
  })
  declare minOrderQty: number;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'supports_tinting',
  })
  declare supportsTinting: boolean;

  // Vendor's own grade label, free text — granite grading is not
  // standardized (decisions 0003, 0009). Part of listing identity.
  @Column({
    type: DataType.STRING(64),
    allowNull: true,
    field: 'stated_grade',
  })
  declare statedGrade: string | null;

  @Column({
    type: DataType.ENUM(...Object.values(VendorListingStatus)),
    allowNull: false,
    defaultValue: VendorListingStatus.ACTIVE,
  })
  declare status: VendorListingStatus;

  // Phase 7, risk 2 — runner-up candidates from the match that created
  // this listing, populated only while status = PAUSED. Lets the vendor
  // confirm screen show 2-3 alternatives with differing attributes rather
  // than a single reflexive yes/no button. Cleared (set back to []) on
  // confirm or reject — this is working data for one pending decision,
  // not a permanent record of how the match was made.
  @Column({
    type: DataType.JSONB,
    allowNull: false,
    defaultValue: [],
    field: 'match_candidates',
  })
  declare matchCandidates: ImportMatchCandidate[];

  @BelongsTo(() => Vendor)
  declare vendor?: Vendor;

  @BelongsTo(() => MasterProduct)
  declare masterProduct?: MasterProduct;

  @HasMany(() => VendorListingColourPrice)
  declare colourPrices?: VendorListingColourPrice[];

  @HasMany(() => Inventory)
  declare inventory?: Inventory[];
}
