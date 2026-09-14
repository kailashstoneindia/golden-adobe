import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  HasMany,
} from 'sequelize-typescript';
import { Category } from './category.model';
import { AttributeValueOption } from './attribute-value-option.model';

export enum AttributeDataType {
  ENUM = 'enum',
  NUMBER = 'number',
  TEXT = 'text',
  BOOLEAN = 'boolean',
}

// Declared once, inherited by all descendants (decision 0001). categoryId
// NULL means GLOBAL — applies to every product in every category; there is
// no single root category to hang global attributes on
// (docs/catalog-structure.md section 0, decision 0005 finding 1).
//
// Uniqueness of `code` (per-category, and separately among globals) is
// enforced by two partial unique indexes in the migration, not here —
// sequelize-typescript has no clean way to express a partial unique index
// via decorators.
@Table({
  tableName: 'attribute',
  timestamps: true,
  underscored: true,
})
export class Attribute extends Model<Attribute> {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @ForeignKey(() => Category)
  @Column({
    type: DataType.UUID,
    allowNull: true,
    field: 'category_id',
  })
  declare categoryId: string | null;

  @Column({
    type: DataType.STRING(64),
    allowNull: false,
  })
  declare code: string;

  @Column({
    type: DataType.STRING(128),
    allowNull: false,
  })
  declare name: string;

  @Column({
    type: DataType.ENUM(...Object.values(AttributeDataType)),
    allowNull: false,
    field: 'data_type',
  })
  declare dataType: AttributeDataType;

  @Column({
    type: DataType.STRING(32),
    allowNull: true,
  })
  declare unit: string | null;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_variant_defining',
  })
  declare isVariantDefining: boolean;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_searchable_filter',
  })
  declare isSearchableFilter: boolean;

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

  @BelongsTo(() => Category)
  declare category?: Category;

  @HasMany(() => AttributeValueOption)
  declare valueOptions?: AttributeValueOption[];
}
