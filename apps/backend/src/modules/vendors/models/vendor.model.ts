import { Table, Column, Model, DataType, ForeignKey, BelongsTo, HasOne, Index } from 'sequelize-typescript';
import { User } from '../../users/models/user.model';
import { VendorAccountDetails } from './vendor-account-details.model';

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

  @BelongsTo(() => User)
  declare user: User;

  @HasOne(() => VendorAccountDetails)
  declare accountDetails?: VendorAccountDetails;
}
