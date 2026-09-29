import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  HasOne,
  Index,
} from 'sequelize-typescript';
import { User } from '../../users/models/user.model';
import { VendorAccountDetails } from './vendor-account-details.model';
import { City } from '../../catalog/models/city.model';

export type VendorCitySource = 'gps' | 'admin';

@Table({
  tableName: 'vendors',
  timestamps: true,
  underscored: true,
})
export class Vendor extends Model<Vendor> {
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
    type: DataType.STRING,
    allowNull: false,
    field: 'shop_name',
  })
  declare shopName: string;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
  })
  declare address: string;

  @Column({
    type: DataType.FLOAT,
    allowNull: false,
  })
  declare latitude: number;

  @Column({
    type: DataType.FLOAT,
    allowNull: false,
  })
  declare longitude: number;

  @Column({
    type: DataType.STRING,
    allowNull: true,
    field: 'upi_id',
  })
  declare upiId: string | null;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
    field: 'bank_details',
  })
  declare bankDetails: string | null;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  declare gstin: string | null;

  // Decision 0018 — "one vendor, one city, for now." NULLable: existing
  // vendor rows predate this column (see
  // 20260828090002-add-city-id-to-vendors.js) and have no city assigned
  // until backfilled.
  @ForeignKey(() => City)
  @Column({
    type: DataType.UUID,
    allowNull: true,
    field: 'city_id',
  })
  declare cityId: string | null;

  // Which writer set cityId — 'gps' (auto-resolved from lat/lng, safe to
  // re-resolve on the next address change) or 'admin' (pinned by an
  // override, left alone). NULL means never set. See
  // 20260902090000-add-city-source-to-vendors.js.
  @Column({
    type: DataType.STRING(16),
    allowNull: true,
    field: 'city_source',
  })
  declare citySource: VendorCitySource | null;

  @BelongsTo(() => User)
  declare user: User;

  @BelongsTo(() => City)
  declare city?: City;

  @HasOne(() => VendorAccountDetails)
  declare accountDetails?: VendorAccountDetails;
}
