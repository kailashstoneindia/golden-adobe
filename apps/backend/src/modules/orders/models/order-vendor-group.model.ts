import { Table, Column, Model, DataType, ForeignKey, BelongsTo, HasMany } from 'sequelize-typescript';
import { Order } from './order.model';
import { Vendor } from '../../vendors/models/vendor.model';
import { OrderItem } from './order-item.model';

export enum OrderVendorGroupStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
}

@Table({ tableName: 'order_vendor_group', timestamps: true, underscored: true })
export class OrderVendorGroup extends Model<OrderVendorGroup> {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @ForeignKey(() => Order)
  @Column({ type: DataType.UUID, allowNull: false, field: 'order_id' })
  declare orderId: string;

  @ForeignKey(() => Vendor)
  @Column({ type: DataType.UUID, allowNull: false, field: 'vendor_id' })
  declare vendorId: string;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false })
  declare subtotal: number;

  @Column({
    type: DataType.STRING(32),
    allowNull: false,
    defaultValue: OrderVendorGroupStatus.PENDING,
  })
  declare status: OrderVendorGroupStatus;

  @BelongsTo(() => Order)
  declare order: Order;

  @BelongsTo(() => Vendor)
  declare vendor: Vendor;

  @HasMany(() => OrderItem)
  declare items: OrderItem[];
}
