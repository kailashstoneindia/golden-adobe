import { Table, Column, Model, DataType, ForeignKey, BelongsTo, Index } from 'sequelize-typescript';
import { ArtisanHireRequest } from './artisan-hire-request.model';

// Append-only history (spec §8.2/§8.4) — updatedAt: false enforces "no
// updated_at column, no in-place update tracking". Never call .update() on
// an existing row; always .create() a new one. "Current estimate" for a
// hire request is always the latest row by createdAt, computed at read
// time, never a separate denormalized column.
@Table({
  tableName: 'artisan_completion_estimates',
  timestamps: true,
  updatedAt: false,
  underscored: true,
})
export class ArtisanCompletionEstimate extends Model<ArtisanCompletionEstimate> {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @Index
  @ForeignKey(() => ArtisanHireRequest)
  @Column({
    type: DataType.UUID,
    allowNull: false,
    field: 'hire_request_id',
  })
  declare hireRequestId: string;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    field: 'estimated_days',
  })
  declare estimatedDays: number;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  declare note: string | null;

  @BelongsTo(() => ArtisanHireRequest)
  declare hireRequest: ArtisanHireRequest;
}
