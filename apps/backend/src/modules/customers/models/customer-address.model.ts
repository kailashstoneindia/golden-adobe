import { Table, Column, Model, DataType, ForeignKey, BelongsTo, Index } from 'sequelize-typescript';
import { Customer } from './customer.model';

@Table({
  tableName: 'customer_addresses',
  timestamps: true,
  underscored: true,
})
export class CustomerAddress extends Model<CustomerAddress> {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @Index
  @ForeignKey(() => Customer)
  @Column({
    type: DataType.UUID,
    allowNull: false,
    field: 'customer_id',
  })
  declare customerId: string;

  @Column({ type: DataType.STRING(64), allowNull: false })
  declare label: string;

  @Column({ type: DataType.STRING, allowNull: false, field: 'address_line_1' })
  declare addressLine1: string;

  @Column({ type: DataType.STRING, allowNull: true, field: 'address_line_2' })
  declare addressLine2: string | null;

  @Column({ type: DataType.STRING, allowNull: false })
  declare city: string;

  @Column({ type: DataType.STRING(10), allowNull: false })
  declare pincode: string;

  @Column({ type: DataType.DECIMAL(9, 6), allowNull: true })
  declare lat: number | null;

  @Column({ type: DataType.DECIMAL(9, 6), allowNull: true })
  declare lng: number | null;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_default' })
  declare isDefault: boolean;

  @BelongsTo(() => Customer)
  declare customer: Customer;
}
