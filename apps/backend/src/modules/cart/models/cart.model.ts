import { Table, Column, Model, DataType, ForeignKey, BelongsTo, HasMany } from 'sequelize-typescript';
import { Customer } from '../../customers/models/customer.model';
import { CartItem } from './cart-item.model';

@Table({ tableName: 'cart', timestamps: true, underscored: true })
export class Cart extends Model<Cart> {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @ForeignKey(() => Customer)
  @Column({ type: DataType.UUID, allowNull: false, unique: true, field: 'customer_id' })
  declare customerId: string;

  @BelongsTo(() => Customer)
  declare customer: Customer;

  @HasMany(() => CartItem)
  declare items: CartItem[];
}
