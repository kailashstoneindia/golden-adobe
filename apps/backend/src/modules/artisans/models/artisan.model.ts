import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  HasOne,
  HasMany,
  Index,
} from 'sequelize-typescript';
import { TradeType } from '@golden-abode/types';
import { User } from '../../users/models/user.model';
import { ArtisanAccountDetails } from './artisan-account-details.model';
import { ArtisanTeamMember } from './artisan-team-member.model';
import { ArtisanHireRequest } from './artisan-hire-request.model';

@Table({
  tableName: 'artisans',
  timestamps: true,
  underscored: true,
})
export class Artisan extends Model<Artisan> {
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
    unique: true,
    field: 'user_id',
  })
  declare userId: string;

  @Column({
    type: DataType.ENUM(
      'CARPENTER',
      'PLUMBER',
      'PAINTER',
      'ELECTRICIAN',
      'MASON',
      'TILE_LAYING',
      'OTHERS',
    ),
    allowNull: false,
    field: 'trade_type',
  })
  declare tradeType: TradeType;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
    field: 'experience_years',
  })
  declare experienceYears: number | null;

  // The only artisan-authored field shown to customers verbatim (spec §5).
  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  declare bio: string | null;

  @Column({
    type: DataType.STRING(10),
    allowNull: true,
    field: 'service_pincode',
  })
  declare servicePincode: string | null;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
    field: 'document_url',
  })
  declare documentUrl: string | null;

  // Artisan-specific verification state, distinct from users.is_approved —
  // gates customer visibility (spec §5).
  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_verified',
  })
  declare isVerified: boolean;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'is_available',
  })
  declare isAvailable: boolean;

  @BelongsTo(() => User)
  declare user: User;

  @HasOne(() => ArtisanAccountDetails)
  declare accountDetails?: ArtisanAccountDetails;

  @HasMany(() => ArtisanTeamMember)
  declare team?: ArtisanTeamMember[];

  @HasMany(() => ArtisanHireRequest)
  declare hireRequests?: ArtisanHireRequest[];
}
