import { Table, Column, Model, DataType, HasMany, HasOne } from 'sequelize-typescript';
import { Role } from '../../../common/enums/role.enum';
import { RefreshToken } from './refresh-token.model';
import { Vendor } from '../../vendors/models/vendor.model';

@Table({
  tableName: 'users',
  timestamps: true,
  underscored: true,
})
export class User extends Model<User> {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  declare name: string;

  @Column({
    type: DataType.STRING,
    allowNull: false,
    unique: true,
  })
  declare phone: string;

  @Column({
    type: DataType.ENUM(...Object.values(Role)),
    allowNull: true, // Null initially until onboarding completes
  })
  declare role: Role | null;

  @Column({
    type: DataType.STRING,
    allowNull: true,
    field: 'device_token',
  })
  declare deviceToken: string | null;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: true,
    field: 'is_active',
  })
  declare isActive: boolean;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false,
    field: 'is_approved',
  })
  declare isApproved: boolean;

  @HasMany(() => RefreshToken)
  declare refreshTokens: RefreshToken[];

  @HasOne(() => Vendor)
  declare vendorProfile?: Vendor;
}
