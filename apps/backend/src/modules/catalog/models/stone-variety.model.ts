import { Table, Column, Model, DataType, HasMany } from 'sequelize-typescript';
import { StoneVarietyAlias } from './stone-variety-alias.model';

// Lookup table for a domain value that is neither an attribute nor a SKU
// (decisions 0003, 0009) — does not hold product rows itself.
@Table({
  tableName: 'stone_variety',
  timestamps: true,
  underscored: true,
})
export class StoneVariety extends Model<StoneVariety> {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @Column({
    type: DataType.STRING(128),
    allowNull: false,
  })
  declare name: string;

  @Column({
    type: DataType.STRING(160),
    allowNull: false,
    unique: true,
  })
  declare slug: string;

  @Column({
    type: DataType.STRING(64),
    allowNull: false,
    field: 'stone_type',
  })
  declare stoneType: string;

  @Column({
    type: DataType.STRING(128),
    allowNull: true,
    field: 'origin_region',
  })
  declare originRegion: string | null;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'is_active',
  })
  declare isActive: boolean;

  @HasMany(() => StoneVarietyAlias)
  declare aliases?: StoneVarietyAlias[];
}
