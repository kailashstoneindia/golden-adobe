export type ProductStatus = 'draft' | 'pending_review' | 'live' | 'deprecated';

export type CategoryNode = {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  path: string;
  level: number;
  isLeaf: boolean;
  unitOfMeasure: string | null;
  productCount: number;
  children: CategoryNode[];
};

export type CategoryAttribute = {
  id: string;
  code: string;
  name: string;
  dataType: 'enum' | 'number' | 'text' | 'boolean';
  unit: string | null;
  isVariantDefining: boolean;
  isSearchableFilter: boolean;
  /** Where the attribute is declared — 'own' on this category, 'inherited'
   *  from an ancestor, or 'global' (category_id IS NULL). */
  scope: 'own' | 'inherited' | 'global';
  declaredOn: string | null;
  options: string[];
};

export type CategoryTreeRowProps = {
  node: CategoryNode;
  selectedId: string | null;
  expandedIds: ReadonlySet<string>;
  onSelect: (node: CategoryNode) => void;
  onToggle: (nodeId: string) => void;
};

export type CategoryAttributeRowProps = {
  attribute: CategoryAttribute;
};

export type CategoryAttributesResponse = {
  category: { id: string; path: string; name: string };
  attributes: CategoryAttribute[];
};

export type ProductListItem = {
  id: string;
  productCode: string;
  name: string;
  status: ProductStatus;
  categoryPath: string;
  brand: string | null;
  listingCount: number;
  updatedAt: string;
};

export type ProductListResponse = {
  items: ProductListItem[];
  total: number;
  page: number;
  limit: number;
};

export type ProductAttributeValue = {
  code: string;
  name: string;
  unit: string | null;
  value: string;
  isVariantDefining: boolean;
};

// Product images (decision 0033). 'processing' means the original is stored but
// its WebP variants are still being made; 'failed' includes an image that has
// been processing for too long, which the API reports as failed.
export type MediaStatus = 'processing' | 'ready' | 'failed';

export type MediaVariants = {
  thumb: string;
  medium: string;
  large: string;
};

export type ProductMedia = {
  id: string;
  type: 'image' | 'spec_sheet_pdf' | 'certification_doc';
  status: MediaStatus;
  error: string | null;
  isPrimary: boolean;
  isRepresentative: boolean;
  displayOrder: number;
  contentType: string | null;
  sizeBytes: number | null;
  // Present once the image is usable.
  variants: MediaVariants | null;
  createdAt: string;
};

// Step 1 of an upload: where and how the browser sends the file straight to S3.
export type MediaUploadTicket = {
  mediaId: string;
  upload: { url: string; fields: Record<string, string> };
  expiresAt: string;
  maxBytes: number;
};

export type ProductDetail = {
  id: string;
  productCode: string;
  name: string;
  slug: string;
  status: ProductStatus;
  categoryId: string;
  categoryPath: string;
  brand: string | null;
  mfrPartNumber: string | null;
  gtin: string | null;
  hsnCode: string | null;
  gstRate: number;
  countryOfOrigin: string;
  isGeneric: boolean;
  attributesFlat: Record<string, unknown>;
  listingCount: number;
  createdAt: string;
  updatedAt: string;
  attributeValues: ProductAttributeValue[];
  media: ProductMedia[];
  // Decision 0058 Task 8: the whole product and who sells it.
  description: string | null;
  productFamily: string | null;
  stoneVariety: string | null;
  unitOfMeasure: string | null;
  saleUnitType: 'discrete' | 'cut_to_length' | 'tinted_to_order';
  packContentQty: number | null;
  hasNaturalVariation: boolean;
  importerDetails: string | null;
  cachedBestPrice: number | null;
  cachedBestVendorName: string | null;
  /** Every vendor listing, active first, then cheapest. */
  listings: ProductListing[];
};

export type ProductListing = {
  id: string;
  vendorId: string;
  shopName: string;
  vendorApproved: boolean;
  /** Rupees, as vendor_listing.price stores them. */
  price: number;
  mrp: number | null;
  status: 'active' | 'paused' | 'out_of_stock';
  /** Null when the listing has no main stock row yet. */
  quantityAvailable: number | null;
  quantityReserved: number | null;
  updatedAt: string;
};

export type ListProductsQuery = {
  search?: string;
  categoryId?: string;
  status?: ProductStatus;
  page?: number;
  limit?: number;
};

// ── Import ────────────────────────────────────────────────────────────────
export type ImportRowError = {
  row: number;
  column?: string;
  message: string;
};

export type ImportResult = {
  createdCount: number;
  errorCount: number;
  errors: ImportRowError[];
};

// ── Review queue ──────────────────────────────────────────────────────────
export type ReviewCandidate = {
  masterProductId: string;
  productName?: string;
  productCode?: string;
  score: number;
  method?: string;
};

export type ReviewQueueRow = {
  id: string;
  vendorId: string;
  vendorName?: string | null;
  rawRowJson: Record<string, unknown>;
  matchCandidates: ReviewCandidate[];
  status: string;
  createdAt?: string;
};

export type BulkPublishRequest = {
  productIds?: string[];
  categoryId?: string;
};

export type BulkPublishFailure = {
  productId: string;
  reason: string;
};

export type BulkPublishResult = {
  requested: number;
  published: number;
  failed: BulkPublishFailure[];
};
