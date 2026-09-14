import { Table, Column, Model, DataType, ForeignKey, BelongsTo } from 'sequelize-typescript';
import { Brand } from './brand.model';

// Phase 7, risk 1 (catalog-integrity-residual-risks.md) — symmetric with
// StoneVarietyAlias. "Havells India Ltd" resolves to the canonical Havells
// row through this table rather than ever becoming a second brand row.
@Table({
  tableName: 'brand_alias',
  timestamps: true,
  updatedAt: false,
  underscored: true,
})
export class BrandAlias extends Model<BrandAlias> {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @ForeignKey(() => Brand)
  @Column({
    type: DataType.UUID,
    allowNull: false,
    field: 'brand_id',
  })
  declare brandId: string;

  // Normalized lowercase, same convention as StoneVarietyAlias.alias.
  @Column({
    type: DataType.STRING(160),
    allowNull: false,
    unique: true,
  })
  declare alias: string;

  @BelongsTo(() => Brand)
  declare brand?: Brand;
}
