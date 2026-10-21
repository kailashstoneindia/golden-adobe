import { Table, Column, Model, DataType, ForeignKey, BelongsTo } from 'sequelize-typescript';
import { MasterProduct } from './master-product.model';

export enum MediaType {
  IMAGE = 'image',
  SPEC_SHEET_PDF = 'spec_sheet_pdf',
  CERTIFICATION_DOC = 'certification_doc',
}

// Where variant generation stands for a storage-backed row (decision 0033).
// Rows with no storage_key are external URLs and are always 'ready'.
export enum ProcessingStatus {
  PROCESSING = 'processing',
  READY = 'ready',
  FAILED = 'failed',
}

// At most one is_primary = true row per product, enforced by a partial
// unique index (idx_mpm_one_primary) in the migration, not here.
//
// For a storage-backed row (storage_key set), `url` exists only to satisfy
// NOT NULL. Clients are given URLs derived from storage_key plus the current
// MEDIA_PUBLIC_BASE_URL, so a CDN domain change needs no data migration.
@Table({
  tableName: 'master_product_media',
  timestamps: true,
  underscored: true,
})
export class MasterProductMedia extends Model<MasterProductMedia> {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @ForeignKey(() => MasterProduct)
  @Column({
    type: DataType.UUID,
    allowNull: false,
    field: 'master_product_id',
  })
  declare masterProductId: string;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
  })
  declare url: string;

  @Column({
    type: DataType.ENUM(...Object.values(MediaType)),
    allowNull: false,
    defaultValue: MediaType.IMAGE,
  })
  declare type: MediaType;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'display_order',
  })
  declare displayOrder: number;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_primary',
  })
  declare isPrimary: boolean;

  // Indicative, not a specific item — e.g. a stone slab photo showing
  // typical grain, not the exact slab a customer will receive.
  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_representative',
  })
  declare isRepresentative: boolean;

  // Key of the private original in the media bucket. NULL for external URLs.
  @Column({ type: DataType.TEXT, allowNull: true, field: 'storage_key' })
  declare storageKey: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'content_type' })
  declare contentType: string | null;

  @Column({ type: DataType.INTEGER, allowNull: true, field: 'size_bytes' })
  declare sizeBytes: number | null;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
    defaultValue: ProcessingStatus.READY,
    field: 'processing_status',
  })
  declare processingStatus: ProcessingStatus;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'processing_error' })
  declare processingError: string | null;

  @Column({ type: DataType.DATE, allowNull: true, field: 'processed_at' })
  declare processedAt: Date | null;

  @BelongsTo(() => MasterProduct)
  declare masterProduct?: MasterProduct;
}
