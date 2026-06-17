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
  id: string;

  @Column({
    type: DataType.STRING(512),
    allowNull: false,
    unique: true,
  })
  token: string;

  @ForeignKey(() => User)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  userId: string;

  @BelongsTo(() => User)
  user: User;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  expiresAt: Date;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false,
  })
  isRevoked: boolean;
}
