import { Table, Column, Model, DataType, ForeignKey, BelongsTo } from 'sequelize-typescript';
import { Attribute } from './attribute.model';

// Only attributes with dataType = 'enum' should carry options. Not a CHECK
// constraint — a CHECK cannot reach across tables — so this is enforced in
// the service layer (docs/catalog-schema.sql section 4).
@Table({
  tableName: 'attribute_value_option',
  timestamps: true,
  underscored: true,
})
export class AttributeValueOption extends Model<AttributeValueOption> {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @ForeignKey(() => Attribute)
  @Column({
    type: DataType.UUID,
    allowNull: false,
    field: 'attribute_id',
  })
  declare attributeId: string;

  @Column({
    type: DataType.STRING(128),
    allowNull: false,
  })
  declare value: string;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'display_order',
  })
  declare displayOrder: number;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'is_active',
  })
  declare isActive: boolean;

  @BelongsTo(() => Attribute)
  declare attribute?: Attribute;
}
