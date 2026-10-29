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

  // State machine: PENDING_ADMIN_REVIEW -> (ACCEPTED_BY_ARTISAN | ADMIN_REJECTED)
  // -> IN_PROGRESS -> (COMPLETED | CANCELLED). Only HireRequestsService.reviewRequest
  // may write this column out of PENDING_ADMIN_REVIEW (spec §8.1, LLD §3).
  @Index
  @Column({
    type: DataType.ENUM(
      'PENDING_ADMIN_REVIEW',
      'ADMIN_REJECTED',
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

  @BelongsTo(() => User, 'customerId')
  declare customer: User;

  @BelongsTo(() => Artisan)
  declare artisan: Artisan;

  @BelongsTo(() => User, 'adminReviewedBy')
  declare adminReviewer?: User;

  @HasMany(() => ArtisanCompletionEstimate)
  declare estimates?: ArtisanCompletionEstimate[];
}
