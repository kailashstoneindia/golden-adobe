import { Table, Column, Model, DataType, ForeignKey, BelongsTo } from 'sequelize-typescript';
import { Vendor } from '../../vendors/models/vendor.model';
import { MasterProduct } from './master-product.model';

// Match once, never re-guess (decision 0011) — after one confirmed match
// the vendor's own SKU is authoritative, so re-uploads skip the matcher
// entirely for this (vendor, vendor_sku) pair.
@Table({
  tableName: 'vendor_product_map',
  timestamps: false,
  underscored: true,
})
export class VendorProductMap extends Model<VendorProductMap> {
  @ForeignKey(() => Vendor)
  @Column({
    type: DataType.UUID,
    allowNull: false,
    primaryKey: true,
    field: 'vendor_id',
  })
  declare vendorId: string;

  @Column({
    type: DataType.STRING(64),
    allowNull: false,
    primaryKey: true,
    field: 'vendor_sku',
  })
  declare vendorSku: string;

  @ForeignKey(() => MasterProduct)
  @Column({
    type: DataType.UUID,
    allowNull: false,
    field: 'master_product_id',
  })
  declare masterProductId: string;

  // 'vendor' | 'admin'
  @Column({
    type: DataType.STRING(16),
    allowNull: false,
    field: 'confirmed_by',
  })
  declare confirmedBy: string;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    field: 'confirmed_at',
  })
  declare confirmedAt: Date;

  @BelongsTo(() => Vendor)
  declare vendor?: Vendor;

  @BelongsTo(() => MasterProduct)
  declare masterProduct?: MasterProduct;
}
