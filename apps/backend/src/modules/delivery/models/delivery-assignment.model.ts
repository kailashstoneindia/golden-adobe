import { Table, Column, Model, DataType, ForeignKey, BelongsTo } from 'sequelize-typescript';
import { DeliveryAssignmentStatus, DeliveryFailureReason } from '@golden-abode/types';
import { OrderVendorGroup } from '../../orders/models/order-vendor-group.model';
import { Driver } from './driver.model';

// Rules live in the spec ("Rules" 1-9). At most one assignment per group may
// be open (assigned/picked_up); Postgres enforces it via uq_delivery_assignment_open.
@Table({ tableName: 'delivery_assignments', timestamps: true, underscored: true })
export class DeliveryAssignment extends Model<DeliveryAssignment> {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @ForeignKey(() => OrderVendorGroup)
  @Column({ type: DataType.UUID, allowNull: false, field: 'order_vendor_group_id' })
  declare orderVendorGroupId: string;

  @ForeignKey(() => Driver)
  @Column({ type: DataType.UUID, allowNull: false, field: 'driver_id' })
  declare driverId: string;

  @Column({ type: DataType.STRING(16), allowNull: false, defaultValue: 'assigned' })
  declare status: DeliveryAssignmentStatus;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 1, field: 'attempt_no' })
  declare attemptNo: number;

  @Column({ type: DataType.UUID, allowNull: false, field: 'assigned_by' })
  declare assignedBy: string;

  @Column({ type: DataType.DATE, allowNull: false, field: 'assigned_at' })
  declare assignedAt: Date;

  @Column({ type: DataType.DATE, allowNull: true, field: 'vendor_handed_over_at' })
  declare vendorHandedOverAt: Date | null;

  @Column({ type: DataType.STRING(255), allowNull: true, field: 'vendor_handover_photo_key' })
  declare vendorHandoverPhotoKey: string | null;

  @Column({ type: DataType.DATE, allowNull: true, field: 'picked_up_at' })
  declare pickedUpAt: Date | null;

  @Column({ type: DataType.JSONB, allowNull: true, field: 'pickup_checklist' })
  declare pickupChecklist: { orderItemId: string; loaded: boolean }[] | null;

  @Column({ type: DataType.STRING(6), allowNull: true, field: 'delivery_otp' })
  declare deliveryOtp: string | null;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0, field: 'otp_attempts' })
  declare otpAttempts: number;

  @Column({ type: DataType.DATE, allowNull: true, field: 'delivered_at' })
  declare deliveredAt: Date | null;

  @Column({ type: DataType.STRING(255), allowNull: true, field: 'delivery_photo_key' })
  declare deliveryPhotoKey: string | null;

  @Column({ type: DataType.DATE, allowNull: true, field: 'failed_at' })
  declare failedAt: Date | null;

  @Column({ type: DataType.STRING(32), allowNull: true, field: 'failure_reason' })
  declare failureReason: DeliveryFailureReason | null;

  @Column({ type: DataType.STRING(500), allowNull: true, field: 'failure_note' })
  declare failureNote: string | null;

  @Column({ type: DataType.STRING(255), allowNull: true, field: 'failure_photo_key' })
  declare failurePhotoKey: string | null;

  @Column({ type: DataType.DATE, allowNull: true, field: 'cancelled_at' })
  declare cancelledAt: Date | null;

  @BelongsTo(() => OrderVendorGroup)
  declare orderVendorGroup: OrderVendorGroup;

  @BelongsTo(() => Driver)
  declare driver: Driver;

  declare createdAt: Date;
  declare updatedAt: Date;
}
