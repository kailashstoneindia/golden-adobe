import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import ExcelJS from 'exceljs';
import { CatalogImportRowError, CatalogImportResult } from '@golden-abode/types';
import { Category } from './models/category.model';
import { Brand } from './models/brand.model';
import { Attribute, AttributeDataType } from './models/attribute.model';
import { MasterProduct, MasterProductStatus } from './models/master-product.model';
import { MasterProductAttributeValue } from './models/master-product-attribute-value.model';
import {
  CatalogAttributeResolverService,
  ResolvedAttributeBlock,
} from './catalog-attribute-resolver.service';

type ParsedRow = {
  rowNumber: number; // 1-based spreadsheet row, header excluded from data rows (so first data row = 2)
  values: Record<string, string | number | undefined>;
};

type ColumnPlan = {
  identityColumns: Set<string>;
  requiredColumns: Set<string>;
  attributeByCode: Map<
    string,
    { attribute: Attribute; blockSource: ResolvedAttributeBlock['source'] }
  >;
};

// Flow 1 — admin master catalog upload (catalog-excel-flows.md). Parses a
// completed template, validates every row against the 5 documented rules,
// creates draft master_product rows for the rows that pass, and returns an
// error-annotated workbook for the rows that don't. Synchronous — Phase 3
// has no staging table or batch tracking; that's vendor import (Phase 4,
// catalog_import_batch / catalog_import_row), a structurally different flow
// with a match ladder this one doesn't need.
@Injectable()
export class CatalogImportUploadService {
  private readonly logger = new Logger(CatalogImportUploadService.name);

  constructor(
    @InjectModel(Category)
    private readonly categoryModel: typeof Category,
    @InjectModel(Brand)
    private readonly brandModel: typeof Brand,
    @InjectModel(MasterProduct)
    private readonly masterProductModel: typeof MasterProduct,
    @InjectModel(MasterProductAttributeValue)
    private readonly attributeValueModel: typeof MasterProductAttributeValue,
    private readonly attributeResolver: CatalogAttributeResolverService,
  ) {}

  async importFile(leafCategoryId: string, fileBuffer: Buffer): Promise<CatalogImportResult> {
    const leaf = await this.categoryModel.findByPk(leafCategoryId);
    if (!leaf) {
      throw new NotFoundException(`category ${leafCategoryId} does not exist`);
    }
    if (!leaf.isLeaf) {
      throw new Error(
        `category ${leafCategoryId} (${leaf.path}) is not a leaf — products can only be imported into a leaf category`,
      );
    }

    const blocks = await this.attributeResolver.resolveEffectiveAttributes(leafCategoryId);
    const plan = this.buildColumnPlan(blocks);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer as unknown as ExcelJS.Buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      throw new Error('uploaded file has no worksheet');
    }

    const { headerToColumnIndex, headerRowValues } = this.readHeader(sheet);
    const rows = this.readDataRows(sheet, headerToColumnIndex);

    const errors: CatalogImportRowError[] = [];
    const createdProductIds: string[] = [];
    const rowErrorsByRowNumber = new Map<number, CatalogImportRowError[]>();

    for (const row of rows) {
      const rowErrors = await this.validateRow(row, plan);
      if (rowErrors.length > 0) {
        errors.push(...rowErrors);
        rowErrorsByRowNumber.set(row.rowNumber, rowErrors);
        continue;
      }

      const productId = await this.createDraftProduct(row, plan, leaf.id);
      createdProductIds.push(productId);
    }

    const result: CatalogImportResult = {
      categoryId: leafCategoryId,
      totalRows: rows.length,
      acceptedCount: createdProductIds.length,
      rejectedCount: rowErrorsByRowNumber.size,
      createdProductIds,
      errors,
    };

    if (rowErrorsByRowNumber.size > 0) {
      result.errorFileBase64 = await this.buildErrorWorkbook(
        sheet,
        headerRowValues,
        rowErrorsByRowNumber,
      );
    }

    this.logger.log(
      `catalog import for category ${leafCategoryId}: ${result.acceptedCount} accepted, ${result.rejectedCount} rejected of ${result.totalRows}`,
    );

    return result;
  }

  private buildColumnPlan(blocks: ResolvedAttributeBlock[]): ColumnPlan {
    const identityColumns = new Set([
      'name',
      'brand',
      'mfr_part_number',
      'gtin',
      'hsn_code',
      'gst_rate',
      'country_of_origin',
      'pack_qty',
    ]);
    const requiredColumns = new Set(['name', 'brand', 'gst_rate', 'country_of_origin']);
    const attributeByCode: ColumnPlan['attributeByCode'] = new Map();

    for (const block of blocks) {
      for (const attribute of block.attributes) {
        if (block.source === 'global' && attribute.code === 'country_of_origin') {
          continue; // already an identity column — see template service
        }
        attributeByCode.set(attribute.code, { attribute, blockSource: block.source });
        if (attribute.isVariantDefining) {
          requiredColumns.add(attribute.code);
        }
      }
    }

    return { identityColumns, requiredColumns, attributeByCode };
  }

  private readHeader(sheet: ExcelJS.Worksheet): {
    headerToColumnIndex: Map<string, number>;
    headerRowValues: string[];
  } {
    const headerRow = sheet.getRow(1);
    const headerToColumnIndex = new Map<string, number>();
    const headerRowValues: string[] = [];

    headerRow.eachCell((cell, colNumber) => {
      const raw = String(cell.value ?? '').trim();
      // Strip the '*' the template puts on required headers — parsing is
      // by header NAME, not position (catalog-excel-flows.md validation
      // rule set, and decision 0011's "parse by header name, not column
      // position" for the sibling vendor flow — the same rule applies
      // here: admins reorder columns too).
      const normalized = raw.replace(/\*$/, '');
      headerToColumnIndex.set(normalized, colNumber);
      headerRowValues[colNumber - 1] = normalized;
    });

    return { headerToColumnIndex, headerRowValues };
  }

  private readDataRows(
    sheet: ExcelJS.Worksheet,
    headerToColumnIndex: Map<string, number>,
  ): ParsedRow[] {
    const rows: ParsedRow[] = [];

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // header

      const isEmpty = row.values == null || (Array.isArray(row.values) && row.values.length <= 1);
      if (isEmpty) return;

      const values: Record<string, string | number | undefined> = {};
      for (const [header, colIndex] of headerToColumnIndex.entries()) {
        const cell = row.getCell(colIndex);
        const v = cell.value;
        if (v == null || v === '') {
          values[header] = undefined;
        } else if (typeof v === 'object' && 'result' in v) {
          // formula cell — use the computed result
          values[header] = (v as { result: string | number }).result;
        } else {
          values[header] = v as string | number;
        }
      }
      rows.push({ rowNumber, values });
    });

    return rows;
  }

  private async validateRow(row: ParsedRow, plan: ColumnPlan): Promise<CatalogImportRowError[]> {
    const errors: CatalogImportRowError[] = [];

    // Rule 1 — required columns present and non-empty.
    for (const requiredCol of plan.requiredColumns) {
      const value = row.values[requiredCol];
      if (value === undefined || value === '') {
        errors.push({
          row: row.rowNumber,
          column: requiredCol,
          message: 'required and empty',
        });
      }
    }

    // Rule 2 — enum values exist in attribute_value_option.
    for (const [code, { attribute }] of plan.attributeByCode.entries()) {
      if (attribute.dataType !== AttributeDataType.ENUM) continue;
      const value = row.values[code];
      if (value === undefined) continue; // absence already caught by rule 1 if required

      const options = (attribute.valueOptions ?? []).filter((o) => o.isActive);
      const allowed = options.map((o) => o.value);
      if (!allowed.includes(String(value))) {
        errors.push({
          row: row.rowNumber,
          column: code,
          message: `"${value}" is not a valid option — expected one of: ${allowed.join(', ')}`,
        });
      }
    }

    // Rule 3 — numeric attributes parse. Unit matching is not enforced here
    // beyond "the column already carries the attribute's declared unit
    // implicitly" (the template header does not append units to the cell
    // value itself, so there is nothing per-cell to cross-check against
    // attribute.unit — the column header IS the unit contract).
    for (const [code, { attribute }] of plan.attributeByCode.entries()) {
      if (attribute.dataType !== AttributeDataType.NUMBER) continue;
      const value = row.values[code];
      if (value === undefined) continue;
      if (typeof value === 'number') continue;
      if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim())) continue;
      errors.push({
        row: row.rowNumber,
        column: code,
        message: `"${value}" is not a valid number`,
      });
    }

    // Rule 3b — gst_rate must parse as a non-negative number (mirrors
    // hsn_code.gst_rate's own CHECK constraint).
    const gstRateRaw = row.values['gst_rate'];
    if (gstRateRaw !== undefined) {
      const n = typeof gstRateRaw === 'number' ? gstRateRaw : Number(gstRateRaw);
      if (Number.isNaN(n) || n < 0) {
        errors.push({ row: row.rowNumber, column: 'gst_rate', message: 'must be a number >= 0' });
      }
    }

    // Rule 4 — brand resolves in `brand`, or is flagged for creation. This
    // implementation REJECTS an unresolved brand rather than silently
    // creating one — brand rows carry mandatory Legal Metrology fields
    // (decision 0014: manufacturer_name, manufacturer_address,
    // consumer_care_email/phone are all NOT NULL) that a catalog import row
    // has no column for, so "flagged for creation" here means "rejected
    // with a clear reason", not an auto-created incomplete brand row.
    const brandName = row.values['brand'];
    if (brandName !== undefined) {
      const brand = await this.brandModel.findOne({
        where: { name: String(brandName) },
      });
      if (!brand) {
        errors.push({
          row: row.rowNumber,
          column: 'brand',
          message: `brand "${brandName}" does not exist — create it first (admin brand management), then re-upload`,
        });
      }
    }

    // Rule 5 — duplicate detection against existing master_product: same
    // brand + MPN. (Same variant-defining attribute set / identity_hash
    // dedup is enforced by the DB at publish time — status stays 'draft'
    // here, per catalog-excel-flows.md, so that check is deliberately left
    // to the DB constraint rather than duplicated in application code.)
    const mfrPartNumber = row.values['mfr_part_number'];
    if (brandName !== undefined && mfrPartNumber !== undefined) {
      const brand = await this.brandModel.findOne({ where: { name: String(brandName) } });
      if (brand) {
        const existing = await this.masterProductModel.findOne({
          where: {
            brandId: brand.id,
            mfrPartNumber: String(mfrPartNumber),
          },
        });
        if (existing) {
          errors.push({
            row: row.rowNumber,
            column: 'mfr_part_number',
            message: `duplicate — brand "${brandName}" + MPN "${mfrPartNumber}" already exists as ${existing.productCode}`,
          });
        }
      }
    }

    // Rule 5b — gtin uniqueness, same reasoning as MPN above.
    const gtin = row.values['gtin'];
    if (gtin !== undefined) {
      const existing = await this.masterProductModel.findOne({
        where: { gtin: String(gtin) },
      });
      if (existing) {
        errors.push({
          row: row.rowNumber,
          column: 'gtin',
          message: `duplicate — gtin "${gtin}" already exists as ${existing.productCode}`,
        });
      }
    }

    return errors;
  }

  private async createDraftProduct(
    row: ParsedRow,
    plan: ColumnPlan,
    leafCategoryId: string,
  ): Promise<string> {
    const brandName = row.values['brand'];
    const brand = brandName
      ? await this.brandModel.findOne({ where: { name: String(brandName) } })
      : null;

    const name = String(row.values['name']);
    const slug = this.slugify(name, row.rowNumber);

    const product = await this.masterProductModel.create({
      categoryId: leafCategoryId,
      brandId: brand?.id ?? null,
      name,
      slug,
      mfrPartNumber: row.values['mfr_part_number'] ? String(row.values['mfr_part_number']) : null,
      gtin: row.values['gtin'] ? String(row.values['gtin']) : null,
      hsnCode: row.values['hsn_code'] ? String(row.values['hsn_code']) : null,
      gstRate: row.values['gst_rate'] !== undefined ? Number(row.values['gst_rate']) : 18.0,
      countryOfOrigin: row.values['country_of_origin']
        ? String(row.values['country_of_origin'])
        : 'India',
      packContentQty: row.values['pack_qty'] !== undefined ? Number(row.values['pack_qty']) : null,
      status: MasterProductStatus.DRAFT, // accepted rows land as draft; publishing is a separate deliberate step
    } as any);

    for (const [code, { attribute }] of plan.attributeByCode.entries()) {
      const value = row.values[code];
      if (value === undefined) continue;
      await this.attributeValueModel.create({
        masterProductId: product.id,
        attributeId: attribute.id,
        value: String(value),
      } as any);
    }

    return product.id;
  }

  private slugify(name: string, rowNumber: number): string {
    const base = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    // Row number suffix keeps this collision-free within one import even
    // when two rows share a name; a real duplicate name across imports
    // still hits master_product.slug's UNIQUE constraint, which is the
    // correct place for that to be caught.
    return `${base}-r${rowNumber}`;
  }

  private async buildErrorWorkbook(
    sourceSheet: ExcelJS.Worksheet,
    headerRowValues: string[],
    rowErrorsByRowNumber: Map<number, CatalogImportRowError[]>,
  ): Promise<string> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Products');

    const columns = headerRowValues.map((h) => ({ header: h, key: h }));
    columns.push({ header: 'import_errors', key: 'import_errors' });
    sheet.columns = columns;

    sourceSheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const rowErrors = rowErrorsByRowNumber.get(rowNumber);
      if (!rowErrors) return; // only re-emit rejected rows — accepted rows already landed as draft products

      const values: Record<string, unknown> = {};
      headerRowValues.forEach((header, idx) => {
        const cell = row.getCell(idx + 1);
        values[header] = cell.value ?? '';
      });
      values['import_errors'] = rowErrors.map((e) => `[${e.column}] ${e.message}`).join('; ');
      sheet.addRow(values);
    });

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.commit();

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer as unknown as ArrayBuffer).toString('base64');
  }
}
