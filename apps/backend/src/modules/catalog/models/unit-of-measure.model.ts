import { Table, Column, Model, DataType } from 'sequelize-typescript';

@Table({
  tableName: 'unit_of_measure',
  timestamps: true,
  underscored: true,
})
export class UnitOfMeasure extends Model<UnitOfMeasure> {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @Column({
    type: DataType.STRING(16),
    allowNull: false,
    unique: true,
  })
  declare code: string;

  @Column({
    type: DataType.STRING(64),
    allowNull: false,
  })
  declare name: string;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'is_active',
  })
  declare isActive: boolean;
}
