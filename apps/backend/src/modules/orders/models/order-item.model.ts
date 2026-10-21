import { Table, Column, Model, DataType, ForeignKey, BelongsTo } from 'sequelize-typescript';
import { OrderVendorGroup } from './order-vendor-group.model';
import { VendorListing } from '../../catalog/models/vendor-listing.model';
import { MasterProduct } from '../../catalog/models/master-product.model';

@Table({ tableName: 'order_items', timestamps: true, underscored: true })
export class OrderItem extends Model<OrderItem> {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @ForeignKey(() => OrderVendorGroup)
  @Column({ type: DataType.UUID, allowNull: false, field: 'order_vendor_group_id' })
  declare orderVendorGroupId: string;

  @ForeignKey(() => VendorListing)
  @Column({ type: DataType.UUID, allowNull: false, field: 'vendor_listing_id' })
  declare vendorListingId: string;

  @ForeignKey(() => MasterProduct)
  @Column({ type: DataType.UUID, allowNull: false, field: 'master_product_id' })
  declare masterProductId: string;

  @Column({ type: DataType.DECIMAL(12, 3), allowNull: false })
  declare quantity: number;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false, field: 'unit_price_snapshot' })
  declare unitPriceSnapshot: number;

  @BelongsTo(() => OrderVendorGroup)
  declare orderVendorGroup: OrderVendorGroup;

  @BelongsTo(() => VendorListing)
  declare vendorListing: VendorListing;

  @BelongsTo(() => MasterProduct)
  declare masterProduct: MasterProduct;
}
