// Phase 3 — admin catalog import (Flow 1 of catalog-excel-flows.md). Shapes
// shared between the backend and the admin panel for the generate-template
// / upload-and-validate round trip. Not vendor inventory import (Flow 2,
// Phase 4) — that has its own staging tables and types.

export type CatalogImportRowError = {
  row: number; // 1-based, matching the spreadsheet row number (header = 1)
  column: string;
  message: string;
};

export type CatalogImportResult = {
  categoryId: string;
  totalRows: number;
  acceptedCount: number;
  rejectedCount: number;
  createdProductIds: string[];
  errors: CatalogImportRowError[];
  // Present only when rejectedCount > 0 — a workbook identical to the
  // upload plus an appended error column, base64-encoded so the response
  // stays a single JSON payload.
  errorFileBase64?: string;
};

// Phase 4 — vendor inventory upload (Flow 2 of catalog-excel-flows.md,
// decision 0011). A vendor row lands in exactly one of three outcomes:
// linked immediately (deterministic match), linked but paused pending the
// vendor's own confirmation (uncertain match — "vendor confirms the first
// match only", 0011 section 5), or needs_review (no confident match at
// all, becomes a product request per Flow 3).
export type VendorImportRowOutcome = {
  row: number;
  productRef: string;
  outcome: 'linked' | 'pending_confirmation' | 'needs_review' | 'rejected';
  vendorListingId?: string;
  matchedMasterProductId?: string;
  matchMethod?: string;
  message?: string;
};

export type VendorImportResult = {
  importBatchId: string;
  totalRows: number;
  linkedCount: number; // steps 0-3, deterministic, already active
  pendingConfirmationCount: number; // steps 4-5, listing created paused, awaiting vendor confirm
  needsReviewCount: number; // no candidate at all, or below threshold with the vendor's own product_ref unresolved — becomes a product request
  rejectedCount: number; // rows that failed basic validation (missing price, etc.) before matching even ran
  rows: VendorImportRowOutcome[];
  errorFileBase64?: string;
};

// One item in the vendor's "please confirm these" list — a listing already
// exists (paused), waiting on the vendor's decision.
//
// Phase 7 risk 2 (catalog-integrity-residual-risks.md) — "a vendor can
// confirm a wrong match, permanently," because a single yes/no button
// invites a reflexive tap. This is deliberately NOT a yes/no shape:
// `alternatives` holds 2-3 other candidates the matcher scored close
// behind the current match (empty for deterministic matches, which have
// nothing to compare against), and `differingAttributes` names the
// specific variant-defining attribute(s) that distinguish the matched
// product from its closest alternative — "C-Curve" next to the
// alternative, not just two similar product names, per the doc's own
// recommendation to surface differing attributes rather than names alone.
export type PendingConfirmationCandidate = {
  masterProductId: string;
  productName: string;
  productCode: string;
  score: number;
};

export type PendingConfirmation = {
  vendorListingId: string;
  vendorSku: string | null;
  matchedProductId: string;
  matchedProductName: string;
  matchedProductCode: string;
  matchMethod: string;
  matchConfidence: number | null;
  alternatives: PendingConfirmationCandidate[];
  differingAttributes: Record<string, { matched: string; alternative: string }>;
};

// Admin review-queue item — a needs_review catalog_import_row, with its
// ranked candidates, per decision 0011 section 6 ("stores ranked
// candidates, not a flag").
export type ReviewQueueItem = {
  importRowId: string;
  vendorId: string;
  vendorName: string;
  rawRow: Record<string, unknown>;
  candidates: Array<{
    masterProductId: string;
    productName: string;
    productCode: string;
    score: number;
    matchedOn: string;
  }>;
  createdAt: string;
};
