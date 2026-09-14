import { Table, Column, Model, DataType, ForeignKey, BelongsTo } from 'sequelize-typescript';
import { City } from './city.model';

// Customer location resolution, path 1 of 2 (decision 0018) — a LOOKUP
// table, not a computed mapping. Seeded from the public India Post pincode
// dataset, filtered to NCR launch cities (decision 0020).
@Table({
  tableName: 'pincode_city_map',
  timestamps: true,
  updatedAt: false,
  underscored: true,
})
export class PincodeCityMap extends Model<PincodeCityMap> {
  @Column({
    type: DataType.STRING(6),
    primaryKey: true,
  })
  declare pincode: string;

  @ForeignKey(() => City)
  @Column({
    type: DataType.UUID,
    allowNull: false,
    field: 'city_id',
  })
  declare cityId: string;

  @BelongsTo(() => City)
  declare city?: City;
}
