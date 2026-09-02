import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  HasMany,
} from 'sequelize-typescript';
import { UnitOfMeasure } from './unit-of-measure.model';

// Variable depth 2-3, hard cap at 3 (decision 0001). level/path/is_leaf are
// denormalized and maintained by the service layer — see
// docs/catalog-schema.sql section 3 for the invariants and the leaf-only
// triggers that land with Phase 2 (master_product).
@Table({
  tableName: 'category',
  timestamps: true,
  underscored: true,
})
export class Category extends Model<Category> {
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
    field: 'parent_id',
  })
  declare parentId: string | null;

  @Column({
    type: DataType.STRING(128),
    allowNull: false,
  })
  declare name: string;

  @Column({
    type: DataType.STRING(160),
    allowNull: false,
  })
  declare slug: string;

  @Column({
    type: DataType.SMALLINT,
    allowNull: false,
  })
  declare level: number;

  // 'electrical/switchgear/mcb' — globally unique, used for the subtree
  // prefix match (idx_category_path, text_pattern_ops).
  @Column({
    type: DataType.TEXT,
    allowNull: false,
    unique: true,
  })
  declare path: string;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'is_leaf',
  })
  declare isLeaf: boolean;

  @ForeignKey(() => UnitOfMeasure)
  @Column({
    type: DataType.UUID,
    allowNull: true,
    field: 'unit_of_measure_default_id',
  })
  declare unitOfMeasureDefaultId: string | null;

  @Column({
    type: DataType.STRING(16),
    allowNull: true,
    field: 'hsn_code_default',
  })
  declare hsnCodeDefault: string | null;

  @Column({
    type: DataType.STRING(64),
    allowNull: true,
    field: 'external_taxonomy_code',
  })
  declare externalTaxonomyCode: string | null;

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

  @BelongsTo(() => Category, 'parentId')
  declare parent?: Category;

  @HasMany(() => Category, 'parentId')
  declare children?: Category[];

  @BelongsTo(() => UnitOfMeasure)
  declare unitOfMeasureDefault?: UnitOfMeasure;
}
