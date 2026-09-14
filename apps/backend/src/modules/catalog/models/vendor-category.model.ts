import { Table, Column, Model, DataType, ForeignKey } from 'sequelize-typescript';
import { Vendor } from '../../vendors/models/vendor.model';
import { Category } from './category.model';

// Vendor registration scope, many-to-many. Level 1 doubles as shop type
// (decision 0001) — a shop selling both Plumbing and Sanitaryware registers
// for both.
@Table({
  tableName: 'vendor_category',
  timestamps: true,
  updatedAt: false,
  underscored: true,
})
export class VendorCategory extends Model<VendorCategory> {
  @ForeignKey(() => Vendor)
  @Column({
    type: DataType.UUID,
    allowNull: false,
    primaryKey: true,
    field: 'vendor_id',
  })
  declare vendorId: string;

  @ForeignKey(() => Category)
  @Column({
    type: DataType.UUID,
    allowNull: false,
    primaryKey: true,
    field: 'category_id',
  })
  declare categoryId: string;
}
