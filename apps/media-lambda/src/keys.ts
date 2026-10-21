// Object keys, mirroring apps/backend/src/modules/catalog/media/media-keys.ts
// (decision 0033). Duplicated rather than shared: this package is deployed on its
// own and must not depend on the backend. test/keys.spec.ts asserts the same
// shapes the backend's media-keys.spec.ts does.
//
//   original/products/{productId}/{mediaId}.{jpg|png|webp}            private
//   variants/products/{productId}/{mediaId}/{thumb|medium|large}.webp  public

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const ORIGINAL_RE = new RegExp(`^original/products/(${UUID})/(${UUID})\\.(jpg|png|webp)$`);

export const VARIANT_WIDTHS = { thumb: 200, medium: 600, large: 1200 } as const;
export type VariantName = keyof typeof VARIANT_WIDTHS;

export type ParsedOriginalKey = { productId: string; mediaId: string; extension: string };

// Strict: a key that is not exactly an original this system wrote is null, and
// the handler ignores it. This is also what stops the Lambda re-triggering on
// its own output: variant keys never match.
export function parseOriginalKey(key: string): ParsedOriginalKey | null {
  const match = ORIGINAL_RE.exec(key);
  return match ? { productId: match[1], mediaId: match[2], extension: match[3] } : null;
}

export function variantKey(productId: string, mediaId: string, name: VariantName): string {
  return `variants/products/${productId}/${mediaId}/${name}.webp`;
}

// S3 event keys are URL-encoded, with spaces as "+".
export function decodeEventKey(raw: string): string {
  return decodeURIComponent(raw.replace(/\+/g, ' '));
}
