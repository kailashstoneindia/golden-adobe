import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import ExcelJS from 'exceljs';
import {
  PendingConfirmation,
  ReviewQueueItem,
  VendorImportResult,
  VendorImportRowOutcome,
} from '@golden-abode/types';
import { MasterProduct, SaleUnitType } from './models/master-product.model';
import { VendorListing, VendorListingStatus } from './models/vendor-listing.model';
import {
  VendorListingColourPrice,
  PaintColourFamily,
} from './models/vendor-listing-colour-price.model';
import { VendorProductMap } from './models/vendor-product-map.model';
import { CatalogImportBatch } from './models/catalog-import-batch.model';
import { CatalogImportRow, ImportRowStatus } from './models/catalog-import-row.model';
import { Vendor } from '../vendors/models/vendor.model';
import { Attribute } from './models/attribute.model';
import { MasterProductAttributeValue } from './models/master-product-attribute-value.model';
import { VendorMatchLadderService } from './vendor-match-ladder.service';

type ParsedRow = {
  rowNumber: number;
  productRef?: string;
  vendorSku?: string;
  price?: number;
  mrp?: number;
  qtyAvailable?: number;
  minOrderQty?: number;
  gradeRaw?: string;
  statusRaw?: string;
  colourFamily?: string; // paint-specific extra column
};

// Flow 2 — vendor inventory upload (catalog-excel-flows.md, decision 0011).
// One template for every category, unlike the admin flow (Phase 3) —
// vendors supply price/stock, never specs, so there is nothing to vary
// per-category here.
//
// Confirmation model ("Option A", agreed with the user): steps 0-3
// (deterministic) create an ACTIVE vendor_listing immediately. Steps 4-5
// (structured/fuzzy — uncertain) also create the vendor_listing, but
// PAUSED, with the match recorded on a catalog_import_row so the vendor
// can review and confirm before it goes live — "vendor confirms the first
// match only" (0011 section 5): confirming writes vendor_product_map so
// the SAME vendor_sku is never re-guessed on a future upload (match ladder
// step 0).
@Injectable()
export class VendorCatalogImportService {
  private readonly logger = new Logger(VendorCatalogImportService.name);

  constructor(
    @InjectModel(MasterProduct)
    private readonly masterProductModel: typeof MasterProduct,
    @InjectModel(VendorListing)
    private readonly vendorListingModel: typeof VendorListing,
    @InjectModel(VendorListingColourPrice)
    private readonly vendorListingColourPriceModel: typeof VendorListingColourPrice,
    @InjectModel(VendorProductMap)
    private readonly vendorProductMapModel: typeof VendorProductMap,
    @InjectModel(CatalogImportBatch)
    private readonly importBatchModel: typeof CatalogImportBatch,
    @InjectModel(CatalogImportRow)
    private readonly importRowModel: typeof CatalogImportRow,
    @InjectModel(Vendor)
    private readonly vendorModel: typeof Vendor,
    @InjectModel(Attribute)
    private readonly attributeModel: typeof Attribute,
    private readonly matchLadder: VendorMatchLadderService,
  ) {}

  async importFile(vendorId: string, fileBuffer: Buffer): Promise<VendorImportResult> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer as unknown as ExcelJS.Buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      throw new Error('uploaded file has no worksheet');
    }

    const headerToColumnIndex = this.readHeader(sheet);
    const rows = this.readDataRows(sheet, headerToColumnIndex);

    const batch = await this.importBatchModel.create({
      vendorId,
      rowCount: rows.length,
    } as any);

    const outcomes: VendorImportRowOutcome[] = [];
    let linkedCount = 0;
    let pendingConfirmationCount = 0;
    let needsReviewCount = 0;
    let rejectedCount = 0;

    for (const row of rows) {
      const outcome = await this.processRow(row, vendorId, batch.id);
      outcomes.push(outcome);
      switch (outcome.outcome) {
        case 'linked':
          linkedCount++;
          break;
        case 'pending_confirmation':
          pendingConfirmationCount++;
          break;
        case 'needs_review':
          needsReviewCount++;
          break;
        case 'rejected':
          rejectedCount++;
          break;
      }
    }

    this.logger.log(
      `vendor catalog import batch ${batch.id} for vendor ${vendorId}: ` +
        `${linkedCount} linked, ${pendingConfirmationCount} pending confirmation, ` +
        `${needsReviewCount} needs review, ${rejectedCount} rejected of ${rows.length}`,
    );

    return {
      importBatchId: batch.id,
      totalRows: rows.length,
      linkedCount,
      pendingConfirmationCount,
      needsReviewCount,
      rejectedCount,
      rows: outcomes,
    };
  }

  private async processRow(
    row: ParsedRow,
    vendorId: string,
    importBatchId: string,
  ): Promise<VendorImportRowOutcome> {
    // Basic validation BEFORE matching — a row missing price or a product
    // reference is rejected outright; running the matcher on it would just
    // waste a query for a row that can never become a listing anyway.
    if (!row.productRef) {
      return {
        row: row.rowNumber,
        productRef: '',
        outcome: 'rejected',
        message: 'product_ref is required',
      };
    }
    if (row.price === undefined || Number.isNaN(row.price) || row.price < 0) {
      return {
        row: row.rowNumber,
        productRef: row.productRef,
        outcome: 'rejected',
        message: 'price is required and must be a non-negative number',
      };
    }

    const verdict = await this.matchLadder.match({
      vendorId,
      productRef: row.productRef,
      vendorSku: row.vendorSku,
    });

    if (verdict.status === 'needs_review' && verdict.candidates.length === 0) {
      // Step 6 — no match at all. Stage as a review row with no
      // candidates; catalog-excel-flows.md Flow 3 treats an empty
      // candidate list as the signal this is a NEW product request, not
      // just an ambiguous match.
      const importRow = await this.importRowModel.create({
        importBatchId,
        vendorId,
        rawRowJson: this.rowToJson(row),
        matchCandidates: [],
        status: ImportRowStatus.NEEDS_REVIEW,
      } as any);
      return {
        row: row.rowNumber,
        productRef: row.productRef,
        outcome: 'needs_review',
        message: `no match found — staged as a new product request (import_row ${importRow.id})`,
      };
    }

    if (verdict.status === 'needs_review') {
      // Steps 4-5 found candidates but none confident enough to auto-link,
      // OR this was a step-4/5 structured/fuzzy match that IS confident —
      // matchLadder only returns status='auto_matched' when confident, so
      // reaching here with candidates means genuinely ambiguous. Stage for
      // ADMIN review (not vendor) — the vendor doesn't get to pick between
      // several existing catalog products; that's a data-steward decision
      // per decision 0011 section 6.
      const importRow = await this.importRowModel.create({
        importBatchId,
        vendorId,
        rawRowJson: this.rowToJson(row),
        matchCandidates: verdict.candidates,
        status: ImportRowStatus.NEEDS_REVIEW,
      } as any);
      return {
        row: row.rowNumber,
        productRef: row.productRef,
        outcome: 'needs_review',
        message: `${verdict.candidates.length} candidate(s) found, none confident enough to auto-link — staged for admin review (import_row ${importRow.id})`,
      };
    }

    // auto_matched. Deterministic methods (steps 0-3: manual/mpn/gtin) go
    // straight to an ACTIVE listing. Steps 4-5 (structured/fuzzy) would
    // never reach here as 'auto_matched' unless they cleared
    // STRUCTURED_MATCH_AUTO_THRESHOLD in vendor-match-ladder.service.ts —
    // and per decision 0011 section 5, even a CONFIDENT step-4/5 match
    // still needs the VENDOR's own confirmation before going live (not
    // just meeting a score threshold), so 'structured' is treated as
    // pending confirmation regardless of how it scored.
    const isDeterministic =
      verdict.matchMethod === 'manual' ||
      verdict.matchMethod === 'mpn' ||
      verdict.matchMethod === 'gtin' ||
      verdict.matchMethod === 'variety_alias';

    const listingStatus = isDeterministic ? VendorListingStatus.ACTIVE : VendorListingStatus.PAUSED;

    const matchedProduct = await this.masterProductModel.findByPk(verdict.matchedMasterProductId!);
    const isPaint = matchedProduct?.saleUnitType === SaleUnitType.TINTED_TO_ORDER;

    // For paint, row.price is that COLOUR's price, not the listing's own
    // base price (decisions 0007, 0016 — vendor_listing.price is the
    // untinted price; a colour's price lives in
    // vendor_listing_colour_price). The listing itself is created once
    // per (vendor, product, grade) — findOrCreate collapses every
    // colour-family row from a pre-expanded paint export into the SAME
    // listing, exactly the way the export intends. Its base `price`
    // defaults to the row's price only on first creation (there is no
    // better number to seed it with before any colour price exists);
    // subsequent colour rows never touch it.
    const [listing] = await this.vendorListingModel.findOrCreate({
      where: {
        vendorId,
        masterProductId: verdict.matchedMasterProductId!,
        statedGrade: row.gradeRaw ?? null,
      },
      defaults: {
        vendorId,
        masterProductId: verdict.matchedMasterProductId!,
        vendorSku: verdict.vendorMapKey,
        price: row.price,
        mrp: row.mrp ?? null,
        minOrderQty: row.minOrderQty ?? 1,
        statedGrade: row.gradeRaw ?? null,
        supportsTinting: isPaint,
        status: listingStatus,
        // Phase 7 risk 2 — runner-up candidates from the match, so the
        // vendor's confirm screen can show alternatives instead of a bare
        // yes/no. [] for deterministic matches (steps 0-3), which have
        // nothing to compare against.
        matchCandidates: verdict.candidates,
      } as any,
    });

    if (isPaint && row.colourFamily) {
      const normalizedFamily = row.colourFamily.trim().toLowerCase();
      if (!Object.values(PaintColourFamily).includes(normalizedFamily as PaintColourFamily)) {
        return {
          row: row.rowNumber,
          productRef: row.productRef,
          outcome: 'rejected',
          message: `"${row.colourFamily}" is not a valid colour_family — expected one of: ${Object.values(PaintColourFamily).join(', ')}`,
        };
      }
      // Idempotent per (listing, colour_family) — a re-upload updates the
      // price rather than duplicating, matching the same rule as the
      // listing itself (catalog-excel-flows.md "re-uploading the same
      // file should update rather than duplicate").
      await this.vendorListingColourPriceModel.upsert({
        vendorListingId: listing.id,
        colourFamily: normalizedFamily,
        price: row.price,
      } as any);
    } else if (!listing.isNewRecord) {
      // Idempotent re-upload for the non-paint / no-colour case: an
      // existing listing has its price/qty refreshed rather than a
      // duplicate row being created. findOrCreate above already
      // guarantees no duplicate; this branch updates the ones that
      // already existed. Deliberately NOT taken for a paint colour row —
      // that row's price belongs to one colour family, not the listing's
      // base price, so overwriting listing.price with it would silently
      // corrupt the base/untinted price with whatever colour happened to
      // upload last.
      listing.price = row.price;
      listing.mrp = row.mrp ?? listing.mrp;
      listing.vendorSku = verdict.vendorMapKey;
      await listing.save();
    }

    if (isDeterministic) {
      return {
        row: row.rowNumber,
        productRef: row.productRef,
        outcome: 'linked',
        vendorListingId: listing.id,
        matchedMasterProductId: verdict.matchedMasterProductId!,
        matchMethod: verdict.matchMethod!,
      };
    }

    return {
      row: row.rowNumber,
      productRef: row.productRef,
      outcome: 'pending_confirmation',
      vendorListingId: listing.id,
      matchedMasterProductId: verdict.matchedMasterProductId!,
      matchMethod: verdict.matchMethod!,
      message:
        'matched with moderate confidence — listing created paused, awaiting your confirmation',
    };
  }

  // Vendor confirms a pending (paused) listing as matched — writes
  // vendor_product_map so the SAME vendor_sku is never re-guessed on a
  // future upload (match ladder step 0), then activates the listing.
  async confirmPendingListing(vendorId: string, vendorListingId: string): Promise<VendorListing> {
    const listing = await this.vendorListingModel.findOne({
      where: { id: vendorListingId, vendorId, status: VendorListingStatus.PAUSED },
    });
    if (!listing) {
      throw new NotFoundException(
        `no pending (paused) listing ${vendorListingId} found for this vendor`,
      );
    }

    if (listing.vendorSku) {
      await this.vendorProductMapModel.upsert({
        vendorId,
        vendorSku: listing.vendorSku,
        masterProductId: listing.masterProductId,
        confirmedBy: 'vendor',
        confirmedAt: new Date(),
      } as any);
    }

    listing.status = VendorListingStatus.ACTIVE;
    listing.matchCandidates = []; // resolved — no longer working data
    await listing.save();
    return listing;
  }

  // Vendor picks a DIFFERENT product than the one the matcher originally
  // proposed — one of the alternatives shown alongside it (Phase 7 risk
  // 2). Re-points the SAME listing at the chosen product rather than
  // creating a new one, and writes vendor_product_map against the CHOSEN
  // product, not the original guess — this is the entire point: a vendor
  // correcting the match here must actually change what gets remembered,
  // or the wrong product would keep winning on every future upload.
  async choosePendingListingCandidate(
    vendorId: string,
    vendorListingId: string,
    chosenMasterProductId: string,
  ): Promise<VendorListing> {
    const listing = await this.vendorListingModel.findOne({
      where: { id: vendorListingId, vendorId, status: VendorListingStatus.PAUSED },
    });
    if (!listing) {
      throw new NotFoundException(
        `no pending (paused) listing ${vendorListingId} found for this vendor`,
      );
    }

    const wasAlternative =
      chosenMasterProductId === listing.masterProductId ||
      listing.matchCandidates.some((c) => c.masterProductId === chosenMasterProductId);
    if (!wasAlternative) {
      throw new NotFoundException(
        `${chosenMasterProductId} was not one of the candidates offered for this listing`,
      );
    }

    // Re-point at the chosen product rather than creating a second
    // listing row — a vendor picking an alternative is correcting THIS
    // match, not adding a second one.
    listing.masterProductId = chosenMasterProductId;
    listing.status = VendorListingStatus.ACTIVE;
    listing.matchCandidates = [];

    if (listing.vendorSku) {
      await this.vendorProductMapModel.upsert({
        vendorId,
        vendorSku: listing.vendorSku,
        masterProductId: chosenMasterProductId,
        confirmedBy: 'vendor',
        confirmedAt: new Date(),
      } as any);
    }

    await listing.save();
    return listing;
  }

  // Vendor rejects a pending match — the listing is removed outright (not
  // just left paused forever); the row can be re-uploaded once the vendor
  // sorts out the right product reference, or handled through the admin
  // review queue if it was actually a review-queue row.
  async rejectPendingListing(vendorId: string, vendorListingId: string): Promise<void> {
    const listing = await this.vendorListingModel.findOne({
      where: { id: vendorListingId, vendorId, status: VendorListingStatus.PAUSED },
    });
    if (!listing) {
      throw new NotFoundException(
        `no pending (paused) listing ${vendorListingId} found for this vendor`,
      );
    }
    await listing.destroy();
  }

  async listPendingConfirmations(vendorId: string): Promise<PendingConfirmation[]> {
    const listings = await this.vendorListingModel.findAll({
      where: { vendorId, status: VendorListingStatus.PAUSED },
      include: [MasterProduct],
    });

    const result: PendingConfirmation[] = [];
    for (const l of listings) {
      const matchedProduct = l.masterProduct!;

      const alternativeIds = l.matchCandidates.map((c) => c.masterProductId);
      const alternativeProducts =
        alternativeIds.length > 0
          ? await this.masterProductModel.findAll({
              where: { id: alternativeIds },
              include: [{ model: MasterProductAttributeValue }],
            })
          : [];
      const alternativeById = new Map(alternativeProducts.map((p) => [p.id, p]));

      // Differing attributes vs. the CLOSEST alternative only (Phase 7
      // risk 2 — "surface differing attributes... so the distinguishing
      // detail is visible"). Comparing against every alternative would be
      // noisy; the nearest one is the one a vendor could plausibly
      // confuse the match with.
      let differingAttributes: PendingConfirmation['differingAttributes'] = {};
      const closest = alternativeProducts[0];
      if (closest) {
        const matchedWithAttrs = await this.masterProductModel.findByPk(matchedProduct.id, {
          include: [MasterProductAttributeValue],
        });
        differingAttributes = await this.computeDifferingAttributes(matchedWithAttrs, closest);
      }

      result.push({
        vendorListingId: l.id,
        vendorSku: l.vendorSku,
        matchedProductId: matchedProduct.id,
        matchedProductName: matchedProduct.name,
        matchedProductCode: matchedProduct.productCode,
        matchMethod: 'structured', // paused listings only ever arise from step 4 in this implementation (fuzzy/step 5 never auto-matches, so it never reaches listing creation)
        matchConfidence: null,
        alternatives: l.matchCandidates.map((c) => {
          const p = alternativeById.get(c.masterProductId);
          return {
            masterProductId: c.masterProductId,
            productName: p?.name ?? '(deleted product)',
            productCode: p?.productCode ?? '',
            score: c.score,
          };
        }),
        differingAttributes,
      });
    }
    return result;
  }

  // Attribute CODE (human-readable, e.g. "tripping_curve") -> {matched
  // value, alternative value}, for every attribute where the two
  // products' VALUES actually differ (or one has it and the other
  // doesn't). Attributes with the same value on both are omitted — the
  // point is to show ONLY what distinguishes them, per the doc's
  // "C-Curve next to the alternatives" example. Keyed by code, not the
  // raw attribute_id UUID, since this is meant to render directly in a
  // vendor-facing confirm screen.
  private async computeDifferingAttributes(
    matched: MasterProduct | null,
    alternative: MasterProduct,
  ): Promise<Record<string, { matched: string; alternative: string }>> {
    const result: Record<string, { matched: string; alternative: string }> = {};
    if (!matched) return result;

    const matchedValues = new Map(
      (matched.attributeValues ?? []).map((v) => [v.attributeId, v.value]),
    );
    const altValues = new Map(
      (alternative.attributeValues ?? []).map((v) => [v.attributeId, v.value]),
    );
    const allAttributeIds = [...new Set([...matchedValues.keys(), ...altValues.keys()])];
    if (allAttributeIds.length === 0) return result;

    const attributes = await this.attributeModel.findAll({ where: { id: allAttributeIds } });
    const codeById = new Map(attributes.map((a) => [a.id, a.code]));

    for (const attributeId of allAttributeIds) {
      const matchedValue = matchedValues.get(attributeId) ?? '(none)';
      const altValue = altValues.get(attributeId) ?? '(none)';
      if (matchedValue !== altValue) {
        const code = codeById.get(attributeId) ?? attributeId;
        result[code] = { matched: matchedValue, alternative: altValue };
      }
    }
    return result;
  }

  // Admin review queue — needs_review rows with ranked candidates
  // (decision 0011 section 6).
  async listReviewQueue(): Promise<ReviewQueueItem[]> {
    const rows = await this.importRowModel.findAll({
      where: { status: ImportRowStatus.NEEDS_REVIEW },
      include: [Vendor],
      order: [['createdAt', 'ASC']],
    });

    const result: ReviewQueueItem[] = [];
    for (const row of rows) {
      const candidateProductIds = row.matchCandidates.map((c) => c.masterProductId);
      const candidateProducts =
        candidateProductIds.length > 0
          ? await this.masterProductModel.findAll({ where: { id: candidateProductIds } })
          : [];
      const productById = new Map(candidateProducts.map((p) => [p.id, p]));

      result.push({
        importRowId: row.id,
        vendorId: row.vendorId,
        vendorName: row.vendor?.shopName ?? '(unknown)',
        rawRow: row.rawRowJson,
        candidates: row.matchCandidates.map((c) => ({
          masterProductId: c.masterProductId,
          productName: productById.get(c.masterProductId)?.name ?? '(deleted product)',
          productCode: productById.get(c.masterProductId)?.productCode ?? '',
          score: c.score,
          matchedOn: c.matchedOn,
        })),
        createdAt: row.createdAt.toISOString(),
      });
    }
    return result;
  }

  // Admin links a review-queue row to an existing product — "It exists,
  // matcher missed it" (catalog-excel-flows.md Flow 3, outcome 1). Writes
  // vendor_product_map so the SAME vendor_sku matches automatically next
  // time — "every manual match should teach the matcher."
  async resolveReviewRowAsLink(
    importRowId: string,
    masterProductId: string,
  ): Promise<VendorListing> {
    const importRow = await this.importRowModel.findByPk(importRowId);
    if (!importRow) throw new NotFoundException(`import row ${importRowId} not found`);

    const raw = importRow.rawRowJson as { productRef?: string; vendorSku?: string; price?: number };
    // The vendor's own persistent code, falling back to productRef — same
    // rule as VendorInventoryRow.vendorSku in vendor-match-ladder.service.ts.
    // Reading raw.productRef alone here was a real bug: it keyed
    // vendor_product_map on whatever free text identified the product this
    // ONE time (e.g. a long descriptive name) rather than the vendor's
    // actual SKU, so step 0 would never fire again on a future upload using
    // their normal vendor_sku. Caught by an E2E test asserting the map was
    // written under vendor_sku and finding it written under productRef
    // instead.
    const mapKey = raw.vendorSku ?? raw.productRef;

    if (mapKey) {
      await this.vendorProductMapModel.upsert({
        vendorId: importRow.vendorId,
        vendorSku: mapKey,
        masterProductId,
        confirmedBy: 'admin',
        confirmedAt: new Date(),
      } as any);
    }

    const [listing] = await this.vendorListingModel.findOrCreate({
      where: { vendorId: importRow.vendorId, masterProductId, statedGrade: null },
      defaults: {
        vendorId: importRow.vendorId,
        masterProductId,
        vendorSku: mapKey ?? null,
        price: raw.price ?? 0,
        status: VendorListingStatus.ACTIVE,
      } as any,
    });

    importRow.status = ImportRowStatus.APPROVED;
    importRow.matchedMasterProductId = masterProductId;
    await importRow.save();

    return listing;
  }

  // Admin rejects a review-queue row outright — "Junk or duplicate"
  // (Flow 3, outcome 3).
  async resolveReviewRowAsRejected(importRowId: string, reason: string): Promise<void> {
    const importRow = await this.importRowModel.findByPk(importRowId);
    if (!importRow) throw new NotFoundException(`import row ${importRowId} not found`);
    importRow.status = ImportRowStatus.REJECTED;
    importRow.rawRowJson = { ...importRow.rawRowJson, rejectionReason: reason };
    await importRow.save();
  }

  private rowToJson(row: ParsedRow): Record<string, unknown> {
    return {
      productRef: row.productRef,
      vendorSku: row.vendorSku,
      price: row.price,
      mrp: row.mrp,
      qtyAvailable: row.qtyAvailable,
      minOrderQty: row.minOrderQty,
      grade: row.gradeRaw,
      status: row.statusRaw,
      colourFamily: row.colourFamily,
    };
  }

  private readHeader(sheet: ExcelJS.Worksheet): Map<string, number> {
    const headerRow = sheet.getRow(1);
    const map = new Map<string, number>();
    headerRow.eachCell((cell, colNumber) => {
      const raw = String(cell.value ?? '').trim();
      map.set(raw, colNumber);
    });
    return map;
  }

  private readDataRows(
    sheet: ExcelJS.Worksheet,
    headerToColumnIndex: Map<string, number>,
  ): ParsedRow[] {
    const rows: ParsedRow[] = [];
    const get = (row: ExcelJS.Row, header: string): ExcelJS.CellValue | undefined => {
      const idx = headerToColumnIndex.get(header);
      if (!idx) return undefined;
      return row.getCell(idx).value ?? undefined;
    };
    const num = (v: ExcelJS.CellValue | undefined): number | undefined => {
      if (v === undefined || v === null || v === '') return undefined;
      const n = typeof v === 'number' ? v : Number(v);
      return Number.isNaN(n) ? undefined : n;
    };
    const str = (v: ExcelJS.CellValue | undefined): string | undefined => {
      if (v === undefined || v === null || v === '') return undefined;
      return String(v).trim();
    };

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // header
      const isEmpty = row.values == null || (Array.isArray(row.values) && row.values.length <= 1);
      if (isEmpty) return;

      rows.push({
        rowNumber,
        productRef: str(get(row, 'product_ref')),
        vendorSku: str(get(row, 'vendor_sku')),
        price: num(get(row, 'price')),
        mrp: num(get(row, 'mrp')),
        qtyAvailable: num(get(row, 'qty_available')),
        minOrderQty: num(get(row, 'min_order_qty')),
        gradeRaw: str(get(row, 'grade')),
        statusRaw: str(get(row, 'status')),
        colourFamily: str(get(row, 'colour_family')),
      });
    });

    return rows;
  }
}
