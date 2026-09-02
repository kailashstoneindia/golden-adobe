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
