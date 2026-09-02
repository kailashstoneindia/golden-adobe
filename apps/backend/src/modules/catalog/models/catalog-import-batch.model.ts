import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  HasMany,
} from 'sequelize-typescript';
import { Vendor } from '../../vendors/models/vendor.model';
import { CatalogImportRow } from './catalog-import-row.model';

// Groups a vendor's uploaded file so a bad upload can be reviewed and
// reversed as a unit (catalog-excel-flows.md, "Nothing goes live
// implicitly").
@Table({
  tableName: 'catalog_import_batch',
  timestamps: true,
  underscored: true,
})
export class CatalogImportBatch extends Model<CatalogImportBatch> {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @ForeignKey(() => Vendor)
  @Column({
    type: DataType.UUID,
    allowNull: false,
    field: 'vendor_id',
  })
  declare vendorId: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
    field: 'file_url',
  })
  declare fileUrl: string | null;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'row_count',
  })
  declare rowCount: number;

  @BelongsTo(() => Vendor)
  declare vendor?: Vendor;

  @HasMany(() => CatalogImportRow)
  declare rows?: CatalogImportRow[];
}
