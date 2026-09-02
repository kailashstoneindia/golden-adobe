import { Table, Column, Model, DataType, ForeignKey, BelongsTo } from 'sequelize-typescript';
import { Vendor } from '../../vendors/models/vendor.model';

@Table({
  tableName: 'warehouse',
  timestamps: true,
  underscored: true,
})
export class Warehouse extends Model<Warehouse> {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @ForeignKey(() => Vendor)
  @Column({
    type: DataType.UUID,
    allowNull: false,
    field: 'vendor_id',
  })
  declare vendorId: string;

  @Column({
    type: DataType.STRING(128),
    allowNull: false,
  })
  declare name: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  declare address: string | null;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'is_active',
  })
  declare isActive: boolean;

  @BelongsTo(() => Vendor)
  declare vendor?: Vendor;
}
