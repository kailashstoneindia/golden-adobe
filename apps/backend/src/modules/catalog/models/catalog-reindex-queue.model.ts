import { Table, Column, Model, DataType, ForeignKey, BelongsTo } from 'sequelize-typescript';
import { Category } from './category.model';
import { MasterProduct } from './master-product.model';

export enum CatalogReindexScope {
  ALL = 'all',
  CATEGORY_SUBTREE = 'category_subtree',
  PRODUCT = 'product',
}

// Drained by a background job, not read inline (docs/catalog-schema.sql
// section 9b) — an attribute edit on a high-level category can invalidate
// tens of thousands of products, which must never happen inside the admin's
// own request/transaction. The enqueue trigger (trg_attribute_enqueue_reindex)
// is added in the follow-up migration; this model only reads/writes rows a
// human or job created directly.
@Table({
  tableName: 'catalog_reindex_queue',
  timestamps: false,
  underscored: true,
})
export class CatalogReindexQueue extends Model<CatalogReindexQueue> {
  @Column({
    type: DataType.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  })
  declare id: string;

  @Column({
    type: DataType.ENUM(...Object.values(CatalogReindexScope)),
    allowNull: false,
  })
  declare scope: CatalogReindexScope;

  @ForeignKey(() => Category)
  @Column({
    type: DataType.UUID,
    allowNull: true,
    field: 'category_id',
  })
  declare categoryId: string | null;

  @ForeignKey(() => MasterProduct)
  @Column({
    type: DataType.UUID,
    allowNull: true,
    field: 'master_product_id',
  })
  declare masterProductId: string | null;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
  })
  declare reason: string;

  // DB-defaulted (CURRENT_TIMESTAMP) in the migration — intentionally no
  // client-side defaultValue here after the Phase 1 lesson: a JS-side
  // default is invisible to any raw-SQL insert (bulk seeders, imports).
  @Column({
    type: DataType.DATE,
    allowNull: false,
    field: 'enqueued_at',
  })
  declare enqueuedAt: Date;

  @Column({
    type: DataType.DATE,
    allowNull: true,
    field: 'processed_at',
  })
  declare processedAt: Date | null;

  @BelongsTo(() => Category)
  declare category?: Category;

  @BelongsTo(() => MasterProduct)
  declare masterProduct?: MasterProduct;
}
