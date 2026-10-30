import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  HasMany,
} from 'sequelize-typescript';
import { Customer } from '../../customers/models/customer.model';
import { CustomerAddress } from '../../customers/models/customer-address.model';
import { OrderVendorGroup } from './order-vendor-group.model';

export enum OrderStatus {
  PENDING_PAYMENT = 'pending_payment',
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
}

@Table({ tableName: 'orders', timestamps: true, underscored: true })
export class Order extends Model<Order> {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @ForeignKey(() => Customer)
  @Column({ type: DataType.UUID, allowNull: false, field: 'customer_id' })
  declare customerId: string;

  @ForeignKey(() => CustomerAddress)
  @Column({ type: DataType.UUID, allowNull: false, field: 'delivery_address_id' })
  declare deliveryAddressId: string;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false, field: 'grand_total' })
  declare grandTotal: number;

  @Column({
    type: DataType.STRING(32),
    allowNull: false,
    defaultValue: OrderStatus.PENDING_PAYMENT,
  })
  declare status: OrderStatus;

  @Column({ type: DataType.STRING(128), allowNull: true, field: 'razorpay_order_id' })
  declare razorpayOrderId: string | null;

  @Column({ type: DataType.STRING(128), allowNull: true, field: 'razorpay_payment_id' })
  declare razorpayPaymentId: string | null;

  // Decision 0045: NULL for a direct order (Path A), set to the
  // ArtisanHireRequest this checkout was attributed to (Path B). The hire
  // request is the booking — there is no separate service_bookings table.
  @Column({ type: DataType.UUID, allowNull: true, field: 'booking_id' })
  declare bookingId: string | null;

  @BelongsTo(() => Customer)
  declare customer: Customer;

  @BelongsTo(() => CustomerAddress)
  declare deliveryAddress: CustomerAddress;

  @HasMany(() => OrderVendorGroup)
  declare vendorGroups: OrderVendorGroup[];
}
