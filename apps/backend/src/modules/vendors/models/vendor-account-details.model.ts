import { Table, Column, Model, DataType, ForeignKey, BelongsTo, Index } from 'sequelize-typescript';
import { Vendor } from './vendor.model';

@Table({
  tableName: 'vendor_account_details',
  timestamps: true,
  underscored: true,
})
export class VendorAccountDetails extends Model<VendorAccountDetails> {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @Index
  @ForeignKey(() => Vendor)
  @Column({
    type: DataType.UUID,
    allowNull: false,
    unique: true,
    field: 'vendor_id',
  })
  declare vendorId: string;

  @Column({
    type: DataType.STRING,
    allowNull: false,
    field: 'account_holder_name',
  })
  declare accountHolderName: string;

  @Column({
    type: DataType.STRING,
    allowNull: false,
    field: 'bank_name',
  })
  declare bankName: string;

  @Column({
    type: DataType.STRING,
    allowNull: false,
    field: 'ifsc_code',
  })
  declare ifscCode: string;

  @Column({
    type: DataType.STRING,
    allowNull: false,
    field: 'branch_name',
  })
  declare branchName: string;

  @Column({
    type: DataType.STRING,
    allowNull: false,
    field: 'account_number',
  })
  declare accountNumber: string;

  @BelongsTo(() => Vendor)
  declare vendor: Vendor;
}
