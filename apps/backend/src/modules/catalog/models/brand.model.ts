import { Table, Column, Model, DataType } from 'sequelize-typescript';

// Legal Metrology (Packaged Commodities) Rules 2011, amended 2023 — an
// e-commerce listing must display manufacturer + consumer care details
// before purchase (decision 0010). NOT NULL by decision 0014: a brand that
// cannot supply these is not listed.
@Table({
  tableName: 'brand',
  timestamps: true,
  underscored: true,
})
export class Brand extends Model<Brand> {
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
    type: DataType.TEXT,
    allowNull: true,
    field: 'logo_url',
  })
  declare logoUrl: string | null;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
    field: 'manufacturer_name',
  })
  declare manufacturerName: string;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
    field: 'manufacturer_address',
  })
  declare manufacturerAddress: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
    field: 'consumer_care_email',
  })
  declare consumerCareEmail: string;

  @Column({
    type: DataType.STRING(32),
    allowNull: false,
    field: 'consumer_care_phone',
  })
  declare consumerCarePhone: string;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'is_active',
  })
  declare isActive: boolean;
}
