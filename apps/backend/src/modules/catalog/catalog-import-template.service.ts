import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import ExcelJS from 'exceljs';
import { Category } from './models/category.model';
import { AttributeDataType } from './models/attribute.model';
import { CatalogAttributeResolverService } from './catalog-attribute-resolver.service';

// Identity columns every template carries, regardless of category — these
// map to master_product columns, not attribute rows (catalog-excel-flows.md
// Flow 1, "Identity" block). name/brand are required; gst_rate and
// country_of_origin are required by Indian law (decision 0010) so they are
// too, even though master_product has DB defaults — a generated template
// should make the compliance-required fields visibly mandatory rather than
// relying on the default silently applying.
const IDENTITY_COLUMNS: Array<{ header: string; key: string; required: boolean }> = [
  { header: 'name', key: 'name', required: true },
  { header: 'brand', key: 'brand', required: true },
  { header: 'mfr_part_number', key: 'mfr_part_number', required: false },
  { header: 'gtin', key: 'gtin', required: false },
  { header: 'hsn_code', key: 'hsn_code', required: false },
  { header: 'gst_rate', key: 'gst_rate', required: true },
  { header: 'country_of_origin', key: 'country_of_origin', required: true },
  { header: 'pack_qty', key: 'pack_content_qty', required: false },
];

// Global attributes carry warranty/origin/certification per
// catalog-structure.md section 0 — country_of_origin is already an identity
// column above (decision 0010: NOT NULL master_product column, not an
// attribute), so it is deliberately excluded here to avoid emitting it
// twice.
const GLOBAL_ATTRIBUTE_CODES_TO_SKIP = new Set(['country_of_origin']);

export type GeneratedTemplate = {
  buffer: Buffer;
  filename: string;
};

@Injectable()
export class CatalogImportTemplateService {
  constructor(
    @InjectModel(Category)
    private readonly categoryModel: typeof Category,
    private readonly attributeResolver: CatalogAttributeResolverService,
  ) {}

  async generate(leafCategoryId: string): Promise<GeneratedTemplate> {
    const leaf = await this.categoryModel.findByPk(leafCategoryId);
    const blocks = await this.attributeResolver.resolveEffectiveAttributes(leafCategoryId);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Products');

    // Plain local shape rather than ExcelJS.Column — that interface models
    // the library's runtime Column object (outlineLevel, hidden, style, …
    // all required), not a column DEFINITION, even though exceljs accepts
    // exactly this shape at runtime for `sheet.columns = [...]`. Cast once,
    // at the assignment site below, rather than fighting the type on every
    // push.
    type ColumnDef = { header: string; key: string; width: number };
    const columns: ColumnDef[] = IDENTITY_COLUMNS.map((c) => ({
      header: c.header,
      key: c.key,
      width: Math.max(c.header.length + 4, 14),
    }));

    // requiredHeaders tracks which header cells get the "*" + bold styling
    // below — attribute-derived columns are required when
    // is_variant_defining is true (catalog-excel-flows.md: "Columns marked
    // * are required — derived from is_variant_defining = true, since those
    // are what make the SKU distinct").
    const requiredHeaders = new Set(
      IDENTITY_COLUMNS.filter((c) => c.required).map((c) => c.header),
    );

    // enumColumns tracks, per column letter, the allowed values — used
    // below to attach an Excel data-validation dropdown once the sheet has
    // real column positions.
    const enumColumns: Array<{ header: string; values: string[] }> = [];

    for (const block of blocks) {
      for (const attribute of block.attributes) {
        // Global attributes already covered by an identity column (i.e.
        // country_of_origin) are skipped to avoid a duplicate column.
        if (block.source === 'global' && GLOBAL_ATTRIBUTE_CODES_TO_SKIP.has(attribute.code)) {
          continue;
        }

        columns.push({
          header: attribute.code,
          key: attribute.code,
          width: Math.max(attribute.code.length + 4, 14),
        });

        if (attribute.isVariantDefining) {
          requiredHeaders.add(attribute.code);
        }

        if (attribute.dataType === AttributeDataType.ENUM) {
          const values = (attribute.valueOptions ?? [])
            .filter((o) => o.isActive)
            .sort((a, b) => a.displayOrder - b.displayOrder)
            .map((o) => o.value);
          if (values.length > 0) {
            enumColumns.push({ header: attribute.code, values });
          }
        }
      }
    }

    sheet.columns = columns as ExcelJS.Column[];

    // Style the header row: bold throughout, required columns get a "*"
    // suffix and a distinct fill so a vendor/admin can tell at a glance
    // which fields block acceptance.
    const headerRow = sheet.getRow(1);
    headerRow.eachCell((cell, colNumber) => {
      const col = columns[colNumber - 1];
      const isRequired = requiredHeaders.has(col.header as string);
      cell.value = isRequired ? `${col.header}*` : col.header;
      cell.font = { bold: true };
      if (isRequired) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFE699' }, // light amber — required
        };
      }
    });
    headerRow.commit();

    // Data validation dropdowns for enum columns (per catalog-build-order.md
    // open question 3 — locked columns + dropdowns are worth the exceljs
    // dependency specifically to prevent free-text typos like "Curve E"
    // reaching validation at all).
    //
    // Bounded deliberately, not "generous": exceljs MATERIALIZES every row a
    // dataValidation touches — cell.dataValidation = {...} on an
    // otherwise-empty row makes sheet.rowCount include it. Confirmed with a
    // range of 2000: a workbook built from this template, then filled
    // starting at the first real data row, came back from
    // ExcelJS.Worksheet.addRow() as row 2001, not row 2 — the 1999 empty
    // pre-validated rows above it are real rows as far as exceljs is
    // concerned, not a rendering illusion. The upload parser's row numbers
    // (readDataRows() below, via sheet.eachRow()'s own rowNumber) were
    // never wrong — they correctly reported the row position exceljs
    // actually assigned; the template was creating phantom rows ahead of
    // the real data. 300 is enough for one admin sitting (bulk seeding
    // batches run in the hundreds per catalog-build-order.md, not
    // thousands typed by hand) and keeps the offset small if it's ever
    // exercised by a very full sheet.
    const MAX_TEMPLATE_ROWS = 300;
    for (const enumCol of enumColumns) {
      const colNumber = columns.findIndex((c) => c.key === enumCol.header) + 1;
      if (colNumber === 0) continue;
      const colLetter = sheet.getColumn(colNumber).letter;
      for (let row = 2; row <= MAX_TEMPLATE_ROWS; row++) {
        sheet.getCell(`${colLetter}${row}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`"${enumCol.values.join(',')}"`],
          showErrorMessage: true,
          errorStyle: 'error',
          errorTitle: 'Invalid value',
          error: `Must be one of: ${enumCol.values.join(', ')}`,
        };
      }
    }

    const buffer = (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
    const filename = `${leaf?.path?.replace(/\//g, '-') ?? leafCategoryId}-template.xlsx`;

    return { buffer, filename };
  }
}
