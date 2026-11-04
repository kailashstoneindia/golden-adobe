import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  HasMany,
  Index,
} from 'sequelize-typescript';
import { ArtisanHireRequestStatus } from '@golden-abode/types';
import { User } from '../../users/models/user.model';
import { Artisan } from './artisan.model';
import { ArtisanCompletionEstimate } from './artisan-completion-estimate.model';

@Table({
  tableName: 'artisan_hire_requests',
  timestamps: true,
  underscored: true,
})
export class ArtisanHireRequest extends Model<ArtisanHireRequest> {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @Index
  @ForeignKey(() => User)
  @Column({
    type: DataType.UUID,
    allowNull: false,
    field: 'customer_id',
  })
  declare customerId: string;

  @Index
  @ForeignKey(() => Artisan)
  @Column({
    type: DataType.UUID,
    allowNull: false,
    field: 'artisan_id',
  })
  declare artisanId: string;

  // State machine (0045, amended by 0055):
  //   PENDING_ADMIN_REVIEW -> (PENDING_ARTISAN_RESPONSE | ADMIN_REJECTED)
  //   PENDING_ARTISAN_RESPONSE -> (ACCEPTED_BY_ARTISAN | ARTISAN_DECLINED | EXPIRED)
  //   ACCEPTED_BY_ARTISAN -> IN_PROGRESS -> COMPLETED
  //   any open status -> CANCELLED
  // Only HireRequestsService.reviewRequest may write this column out of
  // PENDING_ADMIN_REVIEW (spec §8.1, LLD §3).
  @Index
  @Column({
    type: DataType.ENUM(
      'PENDING_ADMIN_REVIEW',
      'ADMIN_REJECTED',
      'PENDING_ARTISAN_RESPONSE',
      'ARTISAN_DECLINED',
      'EXPIRED',
      'ACCEPTED_BY_ARTISAN',
      'IN_PROGRESS',
      'COMPLETED',
      'CANCELLED',
    ),
    allowNull: false,
    defaultValue: 'PENDING_ADMIN_REVIEW',
  })
  declare status: ArtisanHireRequestStatus;

  @ForeignKey(() => User)
  @Column({
    type: DataType.UUID,
    allowNull: true,
    field: 'admin_reviewed_by',
  })
  declare adminReviewedBy: string | null;

  @Column({
    type: DataType.DATE,
    allowNull: true,
    field: 'admin_reviewed_at',
  })
  declare adminReviewedAt: Date | null;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
    field: 'admin_reject_reason',
  })
  declare adminRejectReason: string | null;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
    field: 'address_text',
  })
  declare addressText: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  declare notes: string | null;

  // Set exactly once, by startWork, when status moves ACCEPTED_BY_ARTISAN ->
  // IN_PROGRESS. Never updated afterwards — mirrors admin_reviewed_at's
  // write-once convention above.
  @Column({
    type: DataType.DATE,
    allowNull: true,
    field: 'started_at',
  })
  declare startedAt: Date | null;

  // Set exactly once, by completeWork, when status moves IN_PROGRESS ->
  // COMPLETED.
  @Column({
    type: DataType.DATE,
    allowNull: true,
    field: 'completed_at',
  })
  declare completedAt: Date | null;

  // Set exactly once, by cancel, when status moves to CANCELLED. The customer
  // and admin may cancel from PENDING_ADMIN_REVIEW, PENDING_ARTISAN_RESPONSE,
  // ACCEPTED_BY_ARTISAN or IN_PROGRESS; the ustaad only from the last two —
  // while a request waits on them they decline instead (0055).
  @Column({
    type: DataType.DATE,
    allowNull: true,
    field: 'cancelled_at',
  })
  declare cancelledAt: Date | null;

  // Mirrors admin_reject_reason's log-and-display pattern: always set
  // alongside cancelled_at, never set independently of it.
  @Column({
    type: DataType.TEXT,
    allowNull: true,
    field: 'cancel_reason',
  })
  declare cancelReason: string | null;

  // Set once, when the ustaad accepts or declines (0055).
  @Column({
    type: DataType.DATE,
    allowNull: true,
    field: 'artisan_responded_at',
  })
  declare artisanRespondedAt: Date | null;

  // Always set alongside artisan_responded_at on a decline, never on accept.
  @Column({
    type: DataType.TEXT,
    allowNull: true,
    field: 'artisan_decline_reason',
  })
  declare artisanDeclineReason: string | null;

  @BelongsTo(() => User, 'customerId')
  declare customer: User;

  @BelongsTo(() => Artisan)
  declare artisan: Artisan;

  @BelongsTo(() => User, 'adminReviewedBy')
  declare adminReviewer?: User;

  @HasMany(() => ArtisanCompletionEstimate)
  declare estimates?: ArtisanCompletionEstimate[];
}
