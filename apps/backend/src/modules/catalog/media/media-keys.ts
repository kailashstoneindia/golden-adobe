// Object key scheme for product media (decision 0033). Pure functions, no I/O.
//
//   original/products/{productId}/{mediaId}.{jpg|png|webp}           private
//   variants/products/{productId}/{mediaId}/{thumb|medium|large}.webp public
//
// Keys are immutable (a new upload gets a new mediaId), so the CDN never needs
// an invalidation. The client never supplies a key: it is always rebuilt here
// from two UUIDs, which is what makes path traversal impossible.

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const UUID_RE = new RegExp(`^${UUID}$`);

// content type -> extension. Anything else (HEIC included, which sharp's
// prebuilt binary cannot decode) is refused before a presigned URL is issued.
export const MEDIA_CONTENT_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;
export type MediaContentType = keyof typeof MEDIA_CONTENT_TYPES;

export const VARIANT_WIDTHS = { thumb: 200, medium: 600, large: 1200 } as const;
export type VariantName = keyof typeof VARIANT_WIDTHS;
export const VARIANT_NAMES = Object.keys(VARIANT_WIDTHS) as VariantName[];

export function isAllowedContentType(value: string): value is MediaContentType {
  return Object.prototype.hasOwnProperty.call(MEDIA_CONTENT_TYPES, value);
}

export function isMediaUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function assertUuid(value: string, label: string): void {
  if (!isMediaUuid(value)) {
    throw new Error(`${label} must be a lowercase UUID, got "${value}"`);
  }
}

export function originalKey(
  productId: string,
  mediaId: string,
  contentType: MediaContentType,
): string {
  assertUuid(productId, 'productId');
  assertUuid(mediaId, 'mediaId');
  return `original/products/${productId}/${mediaId}.${MEDIA_CONTENT_TYPES[contentType]}`;
}

export function variantKeys(productId: string, mediaId: string): Record<VariantName, string> {
  assertUuid(productId, 'productId');
  assertUuid(mediaId, 'mediaId');
  const prefix = `variants/products/${productId}/${mediaId}`;
  return {
    thumb: `${prefix}/thumb.webp`,
    medium: `${prefix}/medium.webp`,
    large: `${prefix}/large.webp`,
  };
}

// Every object that belongs to one media row, for delete and for the sweep.
export function allKeysFor(
  productId: string,
  mediaId: string,
  contentType: MediaContentType,
): string[] {
  return [
    originalKey(productId, mediaId, contentType),
    ...Object.values(variantKeys(productId, mediaId)),
  ];
}

export type ParsedMediaKey =
  | { kind: 'original'; productId: string; mediaId: string; extension: string }
  | { kind: 'variant'; productId: string; mediaId: string; variant: VariantName };

const ORIGINAL_RE = new RegExp(`^original/products/(${UUID})/(${UUID})\\.(jpg|png|webp)$`);
const VARIANT_RE = new RegExp(
  `^variants/products/(${UUID})/(${UUID})/(thumb|medium|large)\\.webp$`,
);

// Strict: anything that is not exactly one of the two shapes is null, and the
// sweep treats null as "not ours, never delete".
export function parseMediaKey(key: string): ParsedMediaKey | null {
  const original = ORIGINAL_RE.exec(key);
  if (original) {
    return {
      kind: 'original',
      productId: original[1],
      mediaId: original[2],
      extension: original[3],
    };
  }
  const variant = VARIANT_RE.exec(key);
  if (variant) {
    return {
      kind: 'variant',
      productId: variant[1],
      mediaId: variant[2],
      variant: variant[3] as VariantName,
    };
  }
  return null;
}

export function parseOriginalKey(
  key: string,
): Extract<ParsedMediaKey, { kind: 'original' }> | null {
  const parsed = parseMediaKey(key);
  return parsed?.kind === 'original' ? parsed : null;
}

export function variantUrls(
  publicBaseUrl: string,
  productId: string,
  mediaId: string,
): Record<VariantName, string> {
  const base = publicBaseUrl.replace(/\/+$/, '');
  const keys = variantKeys(productId, mediaId);
  return {
    thumb: `${base}/${keys.thumb}`,
    medium: `${base}/${keys.medium}`,
    large: `${base}/${keys.large}`,
  };
}

// URLs are derived at read time from the stored original key, never stored, so
// changing the CDN domain is a config change and not a data migration.
export function variantUrlsFromStorageKey(
  publicBaseUrl: string,
  storageKey: string,
): Record<VariantName, string> | null {
  const parsed = parseOriginalKey(storageKey);
  return parsed ? variantUrls(publicBaseUrl, parsed.productId, parsed.mediaId) : null;
}
