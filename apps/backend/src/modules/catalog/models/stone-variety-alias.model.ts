import { Table, Column, Model, DataType, ForeignKey, BelongsTo } from 'sequelize-typescript';
import { StoneVariety } from './stone-variety.model';

// Drives import matching — stone has no GTIN or MPN, so alias resolution is
// the entry point of the match ladder (decision 0003).
@Table({
  tableName: 'stone_variety_alias',
  timestamps: true,
  updatedAt: false,
  underscored: true,
})
export class StoneVarietyAlias extends Model<StoneVarietyAlias> {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @ForeignKey(() => StoneVariety)
  @Column({
    type: DataType.UUID,
    allowNull: false,
    field: 'stone_variety_id',
  })
  declare stoneVarietyId: string;

  // Normalized lowercase, per docs/catalog-schema.sql section 5.
  @Column({
    type: DataType.STRING(160),
    allowNull: false,
    unique: true,
  })
  declare alias: string;

  @BelongsTo(() => StoneVariety)
  declare stoneVariety?: StoneVariety;
}
