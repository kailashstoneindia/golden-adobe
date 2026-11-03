import { Table, Column, Model, DataType, ForeignKey, BelongsTo } from 'sequelize-typescript';
import { Order } from './order.model';
import { OrderVendorGroup } from './order-vendor-group.model';

export enum RefundStatus {
  REQUESTED = 'requested',
  SUBMITTED = 'submitted',
  PROCESSED = 'processed',
  FAILED = 'failed',
}

export enum RefundRail {
  RAZORPAY = 'razorpay',
  MANUAL_PAYOUT = 'manual_payout',
}

// Decision 0054. One row per refund attempt; the row is written before
// Razorpay is called so a crash or timeout leaves something to retry from.
// receipt and idempotencyKey are generated once and never regenerated.
@Table({ tableName: 'refunds', timestamps: true, underscored: true })
export class Refund extends Model<Refund> {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @ForeignKey(() => Order)
  @Column({ type: DataType.UUID, allowNull: false, field: 'order_id' })
  declare orderId: string;

  @ForeignKey(() => OrderVendorGroup)
  @Column({ type: DataType.UUID, allowNull: true, field: 'order_vendor_group_id' })
  declare orderVendorGroupId: string | null;

  @Column({ type: DataType.STRING(16), allowNull: false })
  declare rail: RefundRail;

  @Column({ type: DataType.STRING(128), allowNull: true, field: 'razorpay_payment_id' })
  declare razorpayPaymentId: string | null;

  @Column({ type: DataType.STRING(128), allowNull: true, field: 'payout_reference' })
  declare payoutReference: string | null;

  // BIGINT comes back from pg as a string; the getter keeps the model's
  // amountPaise a number (paise amounts are far below 2^53).
  @Column({
    type: DataType.BIGINT,
    allowNull: false,
    field: 'amount_paise',
    get(this: Refund) {
      return Number(this.getDataValue('amountPaise'));
    },
  })
  declare amountPaise: number;

  @Column({ type: DataType.STRING(64), allowNull: false, field: 'idempotency_key' })
  declare idempotencyKey: string;

  @Column({ type: DataType.STRING(40), allowNull: false })
  declare receipt: string;

  @Column({ type: DataType.STRING(128), allowNull: true, field: 'razorpay_refund_id' })
  declare razorpayRefundId: string | null;

  @Column({ type: DataType.STRING(16), allowNull: false })
  declare status: RefundStatus;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare reason: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'created_by' })
  declare createdBy: string;

  declare createdAt: Date;
  declare updatedAt: Date;

  @BelongsTo(() => Order)
  declare order: Order;

  @BelongsTo(() => OrderVendorGroup)
  declare orderVendorGroup: OrderVendorGroup | null;
}
