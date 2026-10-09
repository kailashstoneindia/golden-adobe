import { Table, Column, Model, DataType, ForeignKey, BelongsTo, HasMany, Index } from 'sequelize-typescript';
import { User } from '../../users/models/user.model';
import { CustomerAddress } from './customer-address.model';

// Decision 0032 rule 1. Structural mirror of Vendor — same 1:1-with-users
// shape, same resolve-by-user-id pattern its service method follows — minus
// every vendor-specific column. A customer has no shop, no GPS, no payout
// details; phone and email already live on users.
@Table({
  tableName: 'customers',
  timestamps: true,
  underscored: true,
})
export class Customer extends Model<Customer> {
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
    field: 'full_name',
  })
  declare fullName: string;

  @BelongsTo(() => User)
  declare user: User;

  @HasMany(() => CustomerAddress)
  declare addresses: CustomerAddress[];
}
