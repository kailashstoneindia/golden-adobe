import { Table, Column, Model, DataType, ForeignKey, BelongsTo } from 'sequelize-typescript';
import { MasterProduct } from './master-product.model';

export enum MediaType {
  IMAGE = 'image',
  SPEC_SHEET_PDF = 'spec_sheet_pdf',
  CERTIFICATION_DOC = 'certification_doc',
}

// At most one is_primary = true row per product, enforced by a partial
// unique index (idx_mpm_one_primary) in the migration, not here.
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

  @BelongsTo(() => MasterProduct)
  declare masterProduct?: MasterProduct;
}
