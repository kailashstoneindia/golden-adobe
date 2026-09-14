import { Table, Column, Model, DataType, ForeignKey, BelongsTo } from 'sequelize-typescript';
import { VendorListing } from './vendor-listing.model';
import { Warehouse } from './warehouse.model';

// Counts whatever the vendor_listing points at, in the category's unit of
// measure. Paint listings (sale_unit_type = 'tinted_to_order') never get an
// inventory row (decision 0007) — nothing is countable there, so
// VendorListing.status carries availability instead. Not a constraint here;
// a consequence of what application code writes, not a DB-enforced rule.
@Table({
  tableName: 'inventory',
  timestamps: true,
  underscored: true,
})
export class Inventory extends Model<Inventory> {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
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

  @ForeignKey(() => Warehouse)
  @Column({
    type: DataType.UUID,
    allowNull: true,
    field: 'warehouse_id',
  })
  declare warehouseId: string | null;

  @Column({
    type: DataType.DECIMAL(12, 3),
    allowNull: false,
    defaultValue: 0,
    field: 'quantity_available',
  })
  declare quantityAvailable: number;

  @Column({
    type: DataType.DECIMAL(12, 3),
    allowNull: false,
    defaultValue: 0,
    field: 'quantity_reserved',
  })
  declare quantityReserved: number;

  @BelongsTo(() => VendorListing)
  declare vendorListing?: VendorListing;

  @BelongsTo(() => Warehouse)
  declare warehouse?: Warehouse;
}
