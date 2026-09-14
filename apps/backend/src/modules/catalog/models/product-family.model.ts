import { Table, Column, Model, DataType } from 'sequelize-typescript';

@Table({
  tableName: 'product_family',
  timestamps: true,
  underscored: true,
})
export class ProductFamily extends Model<ProductFamily> {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  declare name: string;

  @Column({
    type: DataType.STRING(280),
    allowNull: false,
    unique: true,
  })
  declare slug: string;
}
