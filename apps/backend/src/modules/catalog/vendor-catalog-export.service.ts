import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, WhereOptions } from 'sequelize';
import ExcelJS from 'exceljs';
import { MasterProduct, SaleUnitType } from './models/master-product.model';
import { Brand } from './models/brand.model';
import { UnitOfMeasure } from './models/unit-of-measure.model';
import { PaintColourFamily } from './models/vendor-listing-colour-price.model';

// All 13 colour families a paint listing can price (docs/catalog-schema.sql
// paint_colour_family enum). Pre-expansion order follows the enum's own
// declared order, which is itself not arbitrary in the DDL comment, but
// there is no documented "canonical order" beyond that — this list exists
// once, here, so the export and any future consumer don't redeclare it
// differently.
const PAINT_COLOUR_FAMILIES = Object.values(PaintColourFamily);

export type VendorExportScope = {
  leafCategoryIds: string[]; // required — decision 0011: export scoping is not optional in v1
  brandIds?: string[];
  sinceDate?: Date; // incremental export — "products added since my last download"
};

export type VendorExportResult = {
  buffer: Buffer;
  filename: string;
  rowCount: number;
};

// Pre-filled vendor export (decision 0011, catalog-excel-flows.md Flow 2).
// product_code and name are LOCKED — vendors fill price/qty, never these —
// so matching on re-upload becomes an exact product_code lookup (match
// ladder step 1) rather than the fuzzy path, for every product the vendor
// didn't delete from the sheet.
@Injectable()
export class VendorCatalogExportService {
  constructor(
    @InjectModel(MasterProduct)
    private readonly masterProductModel: typeof MasterProduct,
  ) {}

  // Row count only — the live-count-before-download guard decision 0011
  // calls out as "the real guard against an unusable export". Cheap to
  // call before committing to generating the actual file.
  //
  // Counts SHEET rows, not product rows — a scope containing paint
  // products pre-expands each one to PAINT_COLOUR_FAMILIES.length rows
  // (see generate() below), so a plain product count would understate the
  // real download size by up to 13x for a paint-heavy scope, defeating the
  // exact guard this method exists to provide.
  async countRows(scope: VendorExportScope): Promise<number> {
    const where = this.buildWhere(scope);
    const [nonPaintCount, paintCount] = await Promise.all([
      this.masterProductModel.count({
        where: { ...where, saleUnitType: { [Op.ne]: SaleUnitType.TINTED_TO_ORDER } },
      }),
      this.masterProductModel.count({
        where: { ...where, saleUnitType: SaleUnitType.TINTED_TO_ORDER },
      }),
    ]);
    return nonPaintCount + paintCount * PAINT_COLOUR_FAMILIES.length;
  }

  async generate(scope: VendorExportScope): Promise<VendorExportResult> {
    const products = await this.masterProductModel.findAll({
      where: this.buildWhere(scope),
      include: [Brand, UnitOfMeasure],
      order: [
        [{ model: Brand, as: 'brand' }, 'name', 'ASC'],
        ['name', 'ASC'],
      ],
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('My Catalog');

    sheet.columns = [
      { header: 'product_code', key: 'product_code', width: 16 },
      { header: 'product_name', key: 'product_name', width: 40 },
      { header: 'brand', key: 'brand', width: 18 },
      { header: 'pack', key: 'pack', width: 10 },
      { header: 'unit', key: 'unit', width: 10 },
      // colour_family is pre-filled and LOCKED for paint rows — the vendor
      // fills only price for that family, exactly like product_code/name
      // (catalog-vendor-export-analysis.md 3.4: "pre-expansion is safer").
      // Blank and unlocked for every non-paint row.
      { header: 'colour_family', key: 'colour_family', width: 14 },
      { header: 'vendor_sku', key: 'vendor_sku', width: 18 },
      { header: 'price', key: 'price', width: 12 },
      { header: 'mrp', key: 'mrp', width: 12 },
      { header: 'qty_available', key: 'qty_available', width: 14 },
      { header: 'min_order_qty', key: 'min_order_qty', width: 14 },
      { header: 'grade', key: 'grade', width: 14 },
      { header: 'status', key: 'status', width: 12 },
    ] as ExcelJS.Column[];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    // Lock the identifier/context columns — decision 0011: "product_code —
    // No — locked" / "product_name, brand, pack, unit — No — context,
    // ignored on import". Excel's own sheet protection, not just a
    // convention: prevents accidental edits, though it does not stop a
    // vendor from deliberately overriding it (Excel protection is not a
    // security boundary — the import side re-validates by exact code match
    // regardless, per the comment on readHeader-equivalent logic below).
    // colour_family is handled per-ROW below, not here — it's locked only
    // on the paint-expansion rows that carry a pre-filled family, and left
    // editable everywhere else.
    for (const key of ['product_code', 'product_name', 'brand', 'pack', 'unit']) {
      const col = sheet.getColumn(key);
      col.eachCell({ includeEmpty: true }, (cell) => {
        cell.protection = { locked: true };
      });
    }
    for (const key of [
      'vendor_sku',
      'price',
      'mrp',
      'qty_available',
      'min_order_qty',
      'grade',
      'status',
    ]) {
      const col = sheet.getColumn(key);
      col.eachCell({ includeEmpty: true }, (cell) => {
        cell.protection = { locked: false };
      });
    }
    sheet.protect('', { selectLockedCells: true, selectUnlockedCells: true });

    // Tracked explicitly rather than read back from sheet.rowCount —
    // exceljs's own row bookkeeping has already produced one confusing
    // surprise this project (see the data-validation materialization
    // comment in catalog-import-template.service.ts); counting what this
    // loop actually writes is simpler to trust.
    let sheetRowCount = 0;

    for (const product of products) {
      const baseRow = {
        product_code: product.productCode,
        product_name: product.name,
        brand: product.brand?.name ?? '',
        pack: product.packContentQty ?? '',
        unit: product.unitOfMeasure?.code ?? '',
        vendor_sku: '',
        price: '',
        mrp: '',
        qty_available: '',
        min_order_qty: '',
        grade: '',
        status: 'active',
      };

      if (product.saleUnitType === SaleUnitType.TINTED_TO_ORDER) {
        // Paint: pre-expand to one row per colour family
        // (catalog-vendor-export-analysis.md 3.4). A colour family with no
        // row is not offered by a vendor who deletes it — same "delete
        // rows you don't stock" model as the base export, just at colour
        // grain instead of product grain.
        for (const family of PAINT_COLOUR_FAMILIES) {
          const row = sheet.addRow({ ...baseRow, colour_family: family });
          row.getCell('colour_family').protection = { locked: true };
          sheetRowCount++;
        }
      } else {
        const row = sheet.addRow({ ...baseRow, colour_family: '' });
        row.getCell('colour_family').protection = { locked: false };
        sheetRowCount++;
      }
    }

    // Generated-at timestamp stamped into the file itself (catalog-vendor-
    // export-analysis.md 3.3, "stale exports") — lets a re-upload months
    // later be visibly dated, even though staleness is otherwise handled
    // by re-validating on import, not by anything in this file.
    const metaSheet = workbook.addWorksheet('Info');
    metaSheet.addRow(['Generated at', new Date().toISOString()]);
    metaSheet.addRow(['Product count', products.length]);
    metaSheet.addRow(['Row count', sheetRowCount]);
    metaSheet.getColumn(1).width = 20;

    const buffer = (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
    return {
      buffer,
      filename: `my-catalog-export-${new Date().toISOString().slice(0, 10)}.xlsx`,
      rowCount: sheetRowCount,
    };
  }

  private buildWhere(scope: VendorExportScope): WhereOptions {
    const where: WhereOptions = {
      status: 'live',
      categoryId: { [Op.in]: scope.leafCategoryIds },
    };
    if (scope.brandIds && scope.brandIds.length > 0) {
      where.brandId = { [Op.in]: scope.brandIds };
    }
    if (scope.sinceDate) {
      where.createdAt = { [Op.gte]: scope.sinceDate };
    }
    return where;
  }
}
