import { Table, Column, Model, DataType } from 'sequelize-typescript';

// Admin-curated, not user-generated (decision 0018) — launching a city is
// a business decision, never inferred from a pincode or coordinate on the
// fly.
@Table({
  tableName: 'city',
  timestamps: true,
  underscored: true,
})
export class City extends Model<City> {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @Column({
    type: DataType.STRING(64),
    allowNull: false,
  })
  declare name: string;

  @Column({
    type: DataType.STRING(80),
    allowNull: false,
    unique: true,
  })
  declare slug: string;

  // Disambiguates same-named cities across states.
  @Column({
    type: DataType.STRING(64),
    allowNull: false,
  })
  declare state: string;

  @Column({
    type: DataType.DECIMAL(9, 6),
    allowNull: false,
    field: 'centroid_lat',
  })
  declare centroidLat: number;

  @Column({
    type: DataType.DECIMAL(9, 6),
    allowNull: false,
    field: 'centroid_lng',
  })
  declare centroidLng: number;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'is_active',
  })
  declare isActive: boolean;
}
