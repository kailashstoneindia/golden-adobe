// Catalog onboarding (decision 0063): shapes shared between the backend and
// the admin panel for brand management, product readiness, background
// imports and merges. See docs/superpowers/specs/2026-11-10-catalog-onboarding-design.md.

export type BrandDto = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  manufacturerName: string;
  manufacturerAddress: string;
  consumerCareEmail: string;
  consumerCarePhone: string;
  isActive: boolean;
  mergedIntoId: string | null;
  productCount: number;
  // With ids, so the admin screen can remove one (DELETE /:id/aliases/:aliasId).
  aliases: BrandAliasDto[];
};

export type BrandAliasDto = { id: string; alias: string };

export type MergeBrandResultDto = {
  movedProducts: number;
  // Aliases moved from the merged brand plus its own name, now an alias.
  aliasesAdded: number;
};

export type ProductReadinessCheckCode = 'image' | 'hsn_code' | 'required_attributes' | 'listing';

export type ProductReadinessCheck = {
  code: ProductReadinessCheckCode;
  label: string;
  // A blocking check that fails stops publish; a non-blocking one only warns.
  blocking: boolean;
  passed: boolean;
  detail?: string;
};

export type ProductReadinessDto = {
  ready: boolean;
  checks: ProductReadinessCheck[];
};

export type CatalogImportJobStatus = 'queued' | 'running' | 'done' | 'failed';

export type CatalogImportJobDto = {
  id: string;
  categoryId: string;
  categoryPath: string;
  status: CatalogImportJobStatus;
  totalRows: number;
  processedRows: number;
  acceptedCount: number;
  rejectedCount: number;
  hasErrorFile: boolean;
  // Why a failed job failed, in words an admin can act on.
  failureMessage: string | null;
  createdAt: string;
  finishedAt: string | null;
  createdByName: string;
  undone: boolean;
};

export type MergeResultDto = {
  movedListings: number;
  movedMappings: number;
  mediaMoved: boolean;
  // Listings that would have clashed with one the vendor already has on the
  // target product. They are paused for review, never deleted.
  pausedListings: { listingId: string; vendorName: string; reason: string }[];
};

// Decision 0063 / S9: a starting point for creating a product from a vendor
// row that matched nothing. Vendors send no category or attributes, so those
// start empty; the admin chooses them.
export type ReviewRowPrefillDto = {
  name: string;
  brandText: string | null;
  suggestedBrandId: string | null;
  suggestedBrandName: string | null;
  // What the vendor typed to identify the product (a code, part number or name).
  productRef: string | null;
  categoryId: string | null;
  attributeValues: Record<string, string | number | boolean>;
  vendorName: string;
};
