import { Table, Column, Model, DataType, ForeignKey, BelongsTo } from 'sequelize-typescript';
import { MasterProduct } from './master-product.model';
import { Attribute } from './attribute.model';

// Source of truth for attribute values. attributes_flat on MasterProduct is
// a derived cache of this table, kept in sync by a DB trigger
// (trg_mpav_refresh_flat, follow-up migration) — never write attributesFlat
// directly from application code.
//
// Enum-value validity (a value must exist in attribute_value_option when the
// attribute's dataType is 'enum') is enforced by a DB trigger
// (trg_mpav_enum_value, follow-up migration), not by anything here — a
// foreign key cannot express a conditional-on-another-column constraint.
@Table({
  tableName: 'master_product_attribute_value',
  timestamps: true,
  underscored: true,
})
export class MasterProductAttributeValue extends Model<MasterProductAttributeValue> {
  @ForeignKey(() => MasterProduct)
  @Column({
    type: DataType.UUID,
    allowNull: false,
    primaryKey: true,
    field: 'master_product_id',
  })
  declare masterProductId: string;

  @ForeignKey(() => Attribute)
  @Column({
    type: DataType.UUID,
    allowNull: false,
    primaryKey: true,
    field: 'attribute_id',
  })
  declare attributeId: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  declare value: string;

  @BelongsTo(() => MasterProduct)
  declare masterProduct?: MasterProduct;

  @BelongsTo(() => Attribute)
  declare attribute?: Attribute;
}
