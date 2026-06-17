import { Table, Column, Model, DataType, HasMany } from 'sequelize-typescript';
import { Role } from '../../common/enums/role.enum';
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
  id: string;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  name: string;

  @Column({
    type: DataType.STRING,
    allowNull: false,
    unique: true,
  })
  phone: string;

  @Column({
    type: DataType.ENUM(...Object.values(Role)),
    allowNull: true, // Null initially until onboarding completes
  })
  role: Role | null;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  deviceToken: string | null;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: true,
  })
  isActive: boolean;

  @HasMany(() => RefreshToken)
  refreshTokens: RefreshToken[];
}
