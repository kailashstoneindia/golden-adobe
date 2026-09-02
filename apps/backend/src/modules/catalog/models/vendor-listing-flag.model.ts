import { Table, Column, Model, DataType, ForeignKey, BelongsTo } from 'sequelize-typescript';
import { VendorListing } from './vendor-listing.model';

// Phase 7 — catalog-edit re-validation
// (catalog-integrity-approach.md build order #10). Written primarily by
// the flag_listings_on_variant_attr_edit trigger (see
// 20260829090003-create-vendor-listing-flag.js), not application code —
// an admin editing a variant-defining attribute on an already-LIVE product
// flags every active listing attached to it, since the listing now
// describes something subtly different than what the vendor confirmed.
@Table({
  tableName: 'vendor_listing_flag',
  timestamps: false,
  underscored: true,
})
export class VendorListingFlag extends Model<VendorListingFlag> {
  @Column({
    type: DataType.UUID,
    primaryKey: true,
  })
  declare id: string;

  @ForeignKey(() => VendorListing)
  @Column({
    type: DataType.UUID,
    allowNull: false,
    field: 'vendor_listing_id',
  })
  declare vendorListingId: string;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
  })
  declare reason: string;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    field: 'flagged_at',
  })
  declare flaggedAt: Date;

  @Column({
    type: DataType.DATE,
    allowNull: true,
    field: 'resolved_at',
  })
  declare resolvedAt: Date | null;

  // 'admin' — plain text, same convention as vendor_product_map.confirmed_by
  @Column({
    type: DataType.STRING(16),
    allowNull: true,
    field: 'resolved_by',
  })
  declare resolvedBy: string | null;

  @BelongsTo(() => VendorListing)
  declare vendorListing?: VendorListing;
}
