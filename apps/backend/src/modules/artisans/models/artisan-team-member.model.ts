import { Table, Column, Model, DataType, ForeignKey, BelongsTo, Index } from 'sequelize-typescript';
import { Artisan } from './artisan.model';

// All fields optional per spec §8.3 — team members are not platform users,
// just data the lead artisan records about their own crew.
@Table({
  tableName: 'artisan_team_members',
  timestamps: true,
  underscored: true,
})
export class ArtisanTeamMember extends Model<ArtisanTeamMember> {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @Index
  @ForeignKey(() => Artisan)
  @Column({
    type: DataType.UUID,
    allowNull: false,
    field: 'artisan_id',
  })
  declare artisanId: string;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  declare name: string | null;

  @Column({
    type: DataType.STRING,
    allowNull: true,
    field: 'role_on_team',
  })
  declare roleOnTeam: string | null;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  declare phone: string | null;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
    field: 'document_url',
  })
  declare documentUrl: string | null;

  @BelongsTo(() => Artisan)
  declare artisan: Artisan;
}
