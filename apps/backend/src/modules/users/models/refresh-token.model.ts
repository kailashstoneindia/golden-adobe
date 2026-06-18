import { Table, Column, Model, DataType, ForeignKey, BelongsTo } from 'sequelize-typescript';
import { User } from './user.model';

@Table({
  tableName: 'refresh_tokens',
  timestamps: true,
  underscored: true,
})
export class RefreshToken extends Model<RefreshToken> {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @Column({
    type: DataType.STRING(512),
    allowNull: false,
    unique: true,
  })
  declare token: string;

  @ForeignKey(() => User)
  @Column({
    type: DataType.UUID,
    allowNull: false,
    field: 'user_id',
  })
  declare userId: string;

  @BelongsTo(() => User)
  declare user: User;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    field: 'expires_at',
  })
  declare expiresAt: Date;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false,
    field: 'is_revoked',
  })
  declare isRevoked: boolean;
}
