import { Table, Column, Model, DataType, ForeignKey, BelongsTo } from 'sequelize-typescript';
import { Cart } from './cart.model';
import { VendorListing } from '../../catalog/models/vendor-listing.model';

@Table({ tableName: 'cart_item', timestamps: true, underscored: true })
export class CartItem extends Model<CartItem> {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @ForeignKey(() => Cart)
  @Column({ type: DataType.UUID, allowNull: false, field: 'cart_id' })
  declare cartId: string;

  @ForeignKey(() => VendorListing)
  @Column({ type: DataType.UUID, allowNull: false, field: 'vendor_listing_id' })
  declare vendorListingId: string;

  @Column({ type: DataType.DECIMAL(12, 3), allowNull: false, defaultValue: 1 })
  declare quantity: number;

  @BelongsTo(() => Cart)
  declare cart: Cart;

  @BelongsTo(() => VendorListing)
  declare vendorListing: VendorListing;
}
