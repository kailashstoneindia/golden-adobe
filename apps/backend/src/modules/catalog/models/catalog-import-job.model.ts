import { Table, Column, Model, DataType, ForeignKey, BelongsTo } from 'sequelize-typescript';
import { Category } from './category.model';
import { User } from '../../users/models/user.model';

export type CatalogImportJobStatus = 'queued' | 'running' | 'done' | 'failed';

// One admin product import, run in the background (decision 0063). Keeps the
// history the old in-request import never had: who uploaded what, how many
// rows landed or were rejected, where the error workbook is, and whether the
// import was undone. Products it created point back via
// master_product.import_job_id.
@Table({
  tableName: 'catalog_import_job',
  timestamps: true,
  updatedAt: false,
  underscored: true,
})
export class CatalogImportJob extends Model<CatalogImportJob> {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @ForeignKey(() => Category)
  @Column({ type: DataType.UUID, allowNull: false, field: 'category_id' })
  declare categoryId: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false, field: 'created_by' })
  declare createdBy: string;

  @Column({ type: DataType.TEXT, allowNull: false, field: 'file_key' })
  declare fileKey: string;

  @Column({ type: DataType.STRING(16), allowNull: false, defaultValue: 'queued' })
  declare status: CatalogImportJobStatus;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0, field: 'total_rows' })
  declare totalRows: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0, field: 'processed_rows' })
  declare processedRows: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0, field: 'accepted_count' })
  declare acceptedCount: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0, field: 'rejected_count' })
  declare rejectedCount: number;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'error_file_key' })
  declare errorFileKey: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'failure_message' })
  declare failureMessage: string | null;

  @Column({ type: DataType.DATE, allowNull: true, field: 'undone_at' })
  declare undoneAt: Date | null;

  @Column({ type: DataType.DATE, allowNull: true, field: 'finished_at' })
  declare finishedAt: Date | null;

  declare createdAt: Date;

  @BelongsTo(() => Category)
  declare category?: Category;

  @BelongsTo(() => User, 'createdBy')
  declare creator?: User;
}
