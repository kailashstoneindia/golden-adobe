import { Table, Column, Model, DataType, ForeignKey, BelongsTo, Index } from 'sequelize-typescript';
import { Artisan } from './artisan.model';

@Table({
  tableName: 'artisan_account_details',
  timestamps: true,
  underscored: true,
})
export class ArtisanAccountDetails extends Model<ArtisanAccountDetails> {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @Index
  @ForeignKey(() => Artisan)
  @Column({
    type: DataType.UUID,
    allowNull: false,
    unique: true,
    field: 'artisan_id',
  })
  declare artisanId: string;

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

  @BelongsTo(() => Artisan)
  declare artisan: Artisan;
}
