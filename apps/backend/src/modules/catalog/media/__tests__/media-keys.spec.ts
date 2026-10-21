import {
  allKeysFor,
  isAllowedContentType,
  originalKey,
  parseMediaKey,
  parseOriginalKey,
  variantKeys,
  variantUrls,
  variantUrlsFromStorageKey,
} from '../media-keys';

const PRODUCT = '11111111-1111-4111-8111-111111111111';
const MEDIA = '22222222-2222-4222-8222-222222222222';

describe('media-keys', () => {
  it('builds the original key from the content type', () => {
    expect(originalKey(PRODUCT, MEDIA, 'image/jpeg')).toBe(
      `original/products/${PRODUCT}/${MEDIA}.jpg`,
    );
    expect(originalKey(PRODUCT, MEDIA, 'image/png')).toBe(
      `original/products/${PRODUCT}/${MEDIA}.png`,
    );
    expect(originalKey(PRODUCT, MEDIA, 'image/webp')).toBe(
      `original/products/${PRODUCT}/${MEDIA}.webp`,
    );
  });

  it('builds the three variant keys under one prefix', () => {
    expect(variantKeys(PRODUCT, MEDIA)).toEqual({
      thumb: `variants/products/${PRODUCT}/${MEDIA}/thumb.webp`,
      medium: `variants/products/${PRODUCT}/${MEDIA}/medium.webp`,
      large: `variants/products/${PRODUCT}/${MEDIA}/large.webp`,
    });
  });

  it('lists every object that belongs to one media row', () => {
    expect(allKeysFor(PRODUCT, MEDIA, 'image/jpeg')).toHaveLength(4);
  });

  it('refuses ids that are not lowercase UUIDs, including path traversal', () => {
    expect(() => originalKey('../etc', MEDIA, 'image/jpeg')).toThrow(/productId/);
    expect(() => originalKey(PRODUCT, `${MEDIA}/../x`, 'image/jpeg')).toThrow(/mediaId/);
    expect(() => originalKey('ABCDEF12-1111-4111-8111-111111111111', MEDIA, 'image/jpeg')).toThrow(
      /productId/,
    );
    expect(() => variantKeys(PRODUCT, 'not-a-uuid')).toThrow(/mediaId/);
  });

  it('round-trips an original key', () => {
    const key = originalKey(PRODUCT, MEDIA, 'image/png');
    expect(parseOriginalKey(key)).toEqual({
      kind: 'original',
      productId: PRODUCT,
      mediaId: MEDIA,
      extension: 'png',
    });
  });

  it('round-trips a variant key', () => {
    expect(parseMediaKey(variantKeys(PRODUCT, MEDIA).medium)).toEqual({
      kind: 'variant',
      productId: PRODUCT,
      mediaId: MEDIA,
      variant: 'medium',
    });
  });

  it.each([
    '',
    'original/products/x/y.jpg',
    `original/products/${PRODUCT}/${MEDIA}.gif`,
    `original/products/${PRODUCT}/${MEDIA}.jpg/extra`,
    `../original/products/${PRODUCT}/${MEDIA}.jpg`,
    `variants/products/${PRODUCT}/${MEDIA}/huge.webp`,
    `variants/products/${PRODUCT}/${MEDIA}/thumb.png`,
    `other/products/${PRODUCT}/${MEDIA}.jpg`,
  ])('does not parse a key it did not write: %s', (key) => {
    expect(parseMediaKey(key)).toBeNull();
  });

  it('parseOriginalKey rejects variant keys', () => {
    expect(parseOriginalKey(variantKeys(PRODUCT, MEDIA).thumb)).toBeNull();
  });

  it('derives public URLs and trims a trailing slash on the base', () => {
    expect(variantUrls('https://cdn.example.com/', PRODUCT, MEDIA).thumb).toBe(
      `https://cdn.example.com/variants/products/${PRODUCT}/${MEDIA}/thumb.webp`,
    );
  });

  it('derives URLs from a stored original key, and null for anything else', () => {
    const key = originalKey(PRODUCT, MEDIA, 'image/jpeg');
    expect(variantUrlsFromStorageKey('https://cdn.example.com', key)?.large).toBe(
      `https://cdn.example.com/variants/products/${PRODUCT}/${MEDIA}/large.webp`,
    );
    expect(variantUrlsFromStorageKey('https://cdn.example.com', 'garbage')).toBeNull();
  });

  it('allows only jpeg, png and webp, and not HEIC or objects on the prototype', () => {
    expect(isAllowedContentType('image/jpeg')).toBe(true);
    expect(isAllowedContentType('image/webp')).toBe(true);
    expect(isAllowedContentType('image/heic')).toBe(false);
    expect(isAllowedContentType('application/pdf')).toBe(false);
    expect(isAllowedContentType('constructor')).toBe(false);
  });
});
