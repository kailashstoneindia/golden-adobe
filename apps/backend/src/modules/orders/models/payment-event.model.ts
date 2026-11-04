import { Table, Column, Model, DataType, ForeignKey, BelongsTo } from 'sequelize-typescript';
import { Order } from './order.model';

@Table({ tableName: 'payment_events', timestamps: false, underscored: true })
export class PaymentEvent extends Model<PaymentEvent> {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @ForeignKey(() => Order)
  @Column({ type: DataType.UUID, allowNull: false, field: 'order_id' })
  declare orderId: string;

  @Column({ type: DataType.STRING(64), allowNull: false, field: 'event_type' })
  declare eventType: string;

  // Razorpay's x-razorpay-event-id; unique, so a redelivered webhook is
  // rejected by the database (decision 0054). Null on pre-0054 rows.
  @Column({ type: DataType.STRING(64), allowNull: true, field: 'event_id' })
  declare eventId: string | null;

  @Column({ type: DataType.JSONB, allowNull: false, field: 'raw_payload' })
  declare rawPayload: Record<string, unknown>;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
    field: 'created_at',
  })
  declare createdAt: Date;

  @BelongsTo(() => Order)
  declare order: Order;
}
