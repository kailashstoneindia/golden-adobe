import { Table, Column, Model, DataType, ForeignKey, BelongsTo } from 'sequelize-typescript';
import { User } from '../../users/models/user.model';
import { Vehicle } from './vehicle.model';

// Aadhaar number is never stored, only the uploaded document image (spec).
@Table({ tableName: 'drivers', timestamps: true, underscored: true })
export class Driver extends Model<Driver> {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false, unique: true, field: 'user_id' })
  declare userId: string;

  @Column({ type: DataType.STRING(32), allowNull: false, field: 'licence_number' })
  declare licenceNumber: string;

  @Column({ type: DataType.STRING(255), allowNull: true, field: 'licence_doc_key' })
  declare licenceDocKey: string | null;

  @Column({ type: DataType.STRING(255), allowNull: true, field: 'aadhaar_doc_key' })
  declare aadhaarDocKey: string | null;

  @Column({ type: DataType.STRING(128), allowNull: true, field: 'helper_name' })
  declare helperName: string | null;

  @Column({ type: DataType.STRING(16), allowNull: true, field: 'helper_phone' })
  declare helperPhone: string | null;

  @ForeignKey(() => Vehicle)
  @Column({ type: DataType.UUID, allowNull: true, field: 'vehicle_id' })
  declare vehicleId: string | null;

  @BelongsTo(() => User)
  declare user: User;

  @BelongsTo(() => Vehicle)
  declare vehicle: Vehicle;

  declare createdAt: Date;
  declare updatedAt: Date;
}
