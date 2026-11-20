import { Table, Column, Model, DataType, HasMany } from 'sequelize-typescript';
import { Driver } from './driver.model';

@Table({ tableName: 'vehicles', timestamps: true, underscored: true })
export class Vehicle extends Model<Vehicle> {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @Column({
    type: DataType.STRING(32),
    allowNull: false,
    unique: true,
    field: 'registration_number',
  })
  declare registrationNumber: string;

  @Column({ type: DataType.STRING(64), allowNull: false })
  declare type: string;

  @Column({ type: DataType.STRING(255), allowNull: true })
  declare notes: string | null;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true, field: 'is_active' })
  declare isActive: boolean;

  @HasMany(() => Driver)
  declare drivers: Driver[];

  declare createdAt: Date;
  declare updatedAt: Date;
}
