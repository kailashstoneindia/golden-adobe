import { Table, Column, Model, DataType, ForeignKey, BelongsTo } from 'sequelize-typescript';
import { CatalogImportBatch } from './catalog-import-batch.model';
import { Vendor } from '../../vendors/models/vendor.model';
import { MasterProduct } from './master-product.model';

export enum ImportRowStatus {
  AUTO_MATCHED = 'auto_matched',
  NEEDS_REVIEW = 'needs_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum ImportMatchMethod {
  GTIN = 'gtin',
  MPN = 'mpn',
  STRUCTURED = 'structured',
  VARIETY_ALIAS = 'variety_alias',
  FUZZY = 'fuzzy',
  MANUAL = 'manual',
}

export type ImportMatchCandidate = {
  masterProductId: string;
  score: number;
  matchedOn: string;
  differingAttributes?: Record<string, { candidate: string; row: string }>;
};

// One row per uploaded vendor-inventory line (decision 0011 match ladder —
// catalog-excel-flows.md Flow 2/3). The matching SERVICE that populates
// matchedMasterProductId / matchConfidence / matchMethod / matchCandidates
// is deferred to a follow-up pass; this model only shapes the staging
// table itself.
@Table({
  tableName: 'catalog_import_row',
  timestamps: true,
  underscored: true,
})
export class CatalogImportRow extends Model<CatalogImportRow> {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @ForeignKey(() => CatalogImportBatch)
  @Column({
    type: DataType.UUID,
    allowNull: false,
    field: 'import_batch_id',
  })
  declare importBatchId: string;

  @ForeignKey(() => Vendor)
  @Column({
    type: DataType.UUID,
    allowNull: false,
    field: 'vendor_id',
  })
  declare vendorId: string;

  @Column({
    type: DataType.JSONB,
    allowNull: false,
    field: 'raw_row_json',
  })
  declare rawRowJson: Record<string, unknown>;

  @ForeignKey(() => MasterProduct)
  @Column({
    type: DataType.UUID,
    allowNull: true,
    field: 'matched_master_product_id',
  })
  declare matchedMasterProductId: string | null;

  @Column({
    type: DataType.DECIMAL(5, 4),
    allowNull: true,
    field: 'match_confidence',
  })
  declare matchConfidence: number | null;

  @Column({
    type: DataType.ENUM(...Object.values(ImportMatchMethod)),
    allowNull: true,
    field: 'match_method',
  })
  declare matchMethod: ImportMatchMethod | null;

  // Ranked candidates, not just a verdict (decision 0011) — a data steward
  // needs candidate pairs with scores and differing values to choose from.
  @Column({
    type: DataType.JSONB,
    allowNull: false,
    defaultValue: [],
    field: 'match_candidates',
  })
  declare matchCandidates: ImportMatchCandidate[];

  @Column({
    type: DataType.ENUM(...Object.values(ImportRowStatus)),
    allowNull: false,
    defaultValue: ImportRowStatus.NEEDS_REVIEW,
  })
  declare status: ImportRowStatus;

  @BelongsTo(() => CatalogImportBatch)
  declare importBatch?: CatalogImportBatch;

  @BelongsTo(() => Vendor)
  declare vendor?: Vendor;

  @BelongsTo(() => MasterProduct)
  declare matchedMasterProduct?: MasterProduct;
}
