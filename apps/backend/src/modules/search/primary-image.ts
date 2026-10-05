import type { PrimaryImage } from '@golden-abode/types';

import { variantUrlsFromStorageKey } from '../catalog/media/media-keys';

// The product's primary image for search (decision 0033), shared by the
// Meilisearch document builder and the Postgres fallback so the two engines can
// never disagree about which image a product shows.

// A scalar subquery, not a join: the fallback query is GROUP BY'd with
// aggregates, and a correlated scalar subquery on mp.id (already grouped) needs
// no GROUP BY change, the same trick it uses for the cheapest listing.
//
// productIdExpr is a column reference written by the caller, never user input.
//
// Only images whose variants exist are eligible ('ready'): a 'processing' or
// 'failed' image has nothing public to point at. The primary image wins; with
// no primary the lowest display order does. Returns NULL when none qualifies.
export function primaryImageSubquery(productIdExpr: string): string {
  return `(
    SELECT json_build_object('key', m.storage_key, 'url', m.url)
    FROM master_product_media m
    WHERE m.master_product_id = ${productIdExpr}
      AND m.type = 'image'
      AND m.processing_status = 'ready'
    ORDER BY m.is_primary DESC, m.display_order ASC, m.created_at ASC
    LIMIT 1
  )`;
}

export type RawPrimaryImage = { key: string | null; url: string } | null;

export function toPrimaryImage(
  publicBaseUrl: string,
  raw: RawPrimaryImage | undefined,
): PrimaryImage | null {
  if (!raw) return null;
  // An external-URL row has no key: its one URL serves every size.
  if (!raw.key) return { thumb: raw.url, medium: raw.url, large: raw.url };
  // A stored image needs the public base to be addressable. Without one (media
  // not configured here) there is nothing correct to return.
  if (!publicBaseUrl) return null;
  return variantUrlsFromStorageKey(publicBaseUrl, raw.key);
}
