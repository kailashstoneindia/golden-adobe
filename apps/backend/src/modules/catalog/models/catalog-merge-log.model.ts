import { Table, Column, Model, DataType, ForeignKey, BelongsTo } from 'sequelize-typescript';
import { User } from '../../users/models/user.model';

export type CatalogMergeEntityType = 'brand' | 'product';

// Audit trail for brand and product merges (decision 0063: any admin may
// merge for now, so every merge is logged). from_id/into_id have no foreign
// key because they point at brand or master_product depending on entity_type.
@Table({
  tableName: 'catalog_merge_log',
  timestamps: true,
  updatedAt: false,
  underscored: true,
})
export class CatalogMergeLog extends Model<CatalogMergeLog> {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @Column({ type: DataType.STRING(16), allowNull: false, field: 'entity_type' })
  declare entityType: CatalogMergeEntityType;

  @Column({ type: DataType.UUID, allowNull: false, field: 'from_id' })
  declare fromId: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'into_id' })
  declare intoId: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false, field: 'admin_user_id' })
  declare adminUserId: string;

  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: {} })
  declare summary: Record<string, unknown>;

  declare createdAt: Date;

  @BelongsTo(() => User, 'adminUserId')
  declare admin?: User;
}
