import { Table, Column, Model, DataType } from 'sequelize-typescript';

// GST follows the HSN code (decision 0014) — master_product.gst_rate
// snapshots this.gstRate at write time rather than joining on read.
@Table({
  tableName: 'hsn_code',
  timestamps: true,
  underscored: true,
})
export class HsnCode extends Model<HsnCode> {
  @Column({
    type: DataType.STRING(16),
    primaryKey: true,
  })
  declare code: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  declare description: string;

  @Column({
    type: DataType.DECIMAL(5, 2),
    allowNull: false,
    field: 'gst_rate',
  })
  declare gstRate: number;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'is_active',
  })
  declare isActive: boolean;
}
