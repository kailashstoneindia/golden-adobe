import { Table, Column, Model, DataType, HasMany } from 'sequelize-typescript';
import { Role } from '../../../common/enums/role.enum';
import { RefreshToken } from './refresh-token.model';

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

  @HasMany(() => RefreshToken)
  declare refreshTokens: RefreshToken[];
}
