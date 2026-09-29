// Phase 6b — search document shape (decision 0018). One document per
// (master_product, city) pair — never one product document with per-city
// nested data. Shared between the backend (search-document.builder.ts) and
// the admin panel / mobile app, which both render search results and must
// agree on the shape (search-system-design.md section 8).
export type SearchDocument = {
  // `${masterProductId}__${cityId}` — deterministic, never generated.
  //
  // The separator is `__`, NOT the `:` decision 0018 originally specified.
  // Meilisearch rejects a document id containing a colon outright
  // (invalid_document_id: ids may only contain a-z A-Z 0-9 - and _), which
  // was found by running it rather than reading the docs — every indexing
  // task would have failed. `__` is used rather than `-` because UUIDs
  // already contain hyphens, so a single hyphen would be ambiguous to split
  // on. Verified against Meilisearch v1.53.1.
  id: string;
  masterProductId: string;
  cityId: string;
  name: string;
  categoryPath: string;
  brand: string | null;
  attributes: Record<string, string | number | boolean>;
  // Cheapest ACTIVE listing among vendors in this city — computed at
  // document build time, not re-queried on read (search-system-design.md
  // section 5). This IS the retirement of the old global
  // master_product.cached_best_price, re-scoped to one city.
  price: number;
  cheapestVendorListingId: string;
  vendorCount: number;
  inStock: boolean;
  updatedAt: string;
};

// The generic-object shape Meilisearch actually stores documents as
// (snake_case keys, per search-system-design.md's own TS sketch) — kept
// distinct from SearchDocument because the wire/index format and the
// application-facing type are allowed to diverge, and conflating them
// would make a future Meilisearch field rename touch every consumer
// instead of just the (de)serialization boundary.
export type SearchDocumentRecord = {
  id: string;
  master_product_id: string;
  city_id: string;
  name: string;
  category_path: string;
  brand: string | null;
  attributes: Record<string, string | number | boolean>;
  price: number;
  cheapest_vendor_listing_id: string;
  vendor_count: number;
  in_stock: boolean;
  updated_at: string;
};

export function toSearchDocumentRecord(doc: SearchDocument): SearchDocumentRecord {
  return {
    id: doc.id,
    master_product_id: doc.masterProductId,
    city_id: doc.cityId,
    name: doc.name,
    category_path: doc.categoryPath,
    brand: doc.brand,
    attributes: doc.attributes,
    price: doc.price,
    cheapest_vendor_listing_id: doc.cheapestVendorListingId,
    vendor_count: doc.vendorCount,
    in_stock: doc.inStock,
    updated_at: doc.updatedAt,
  };
}

export function fromSearchDocumentRecord(record: SearchDocumentRecord): SearchDocument {
  return {
    id: record.id,
    masterProductId: record.master_product_id,
    cityId: record.city_id,
    name: record.name,
    categoryPath: record.category_path,
    brand: record.brand,
    attributes: record.attributes,
    price: record.price,
    cheapestVendorListingId: record.cheapest_vendor_listing_id,
    vendorCount: record.vendor_count,
    inStock: record.in_stock,
    updatedAt: record.updated_at,
  };
}

// The separator between the two UUIDs in a document id. Not `:` — Meilisearch
// rejects colons in document ids (see SearchDocument.id) — and not a single
// `-`, because UUIDs contain hyphens and splitting would be ambiguous.
export const SEARCH_DOC_ID_SEPARATOR = '__';

// Builds the deterministic document id — never generated randomly, so the
// delete path (search-system-design.md section 3, "the delete path") can
// compute the same id it would use to upsert.
export function buildSearchDocumentId(masterProductId: string, cityId: string): string {
  return `${masterProductId}${SEARCH_DOC_ID_SEPARATOR}${cityId}`;
}

// Inverse of buildSearchDocumentId. Returns null for anything that is not a
// well-formed id, so a malformed value from the index cannot silently be
// treated as a valid (product, city) pair.
export function parseSearchDocumentId(
  id: string,
): { masterProductId: string; cityId: string } | null {
  const parts = id.split(SEARCH_DOC_ID_SEPARATOR);
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { masterProductId: parts[0], cityId: parts[1] };
}
