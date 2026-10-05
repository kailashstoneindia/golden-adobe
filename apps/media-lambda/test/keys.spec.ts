import { describe, expect, it } from 'vitest';

import { VARIANT_WIDTHS, decodeEventKey, parseOriginalKey, variantKey } from '../src/keys';

const PRODUCT = '11111111-1111-4111-8111-111111111111';
const MEDIA = '22222222-2222-4222-8222-222222222222';

// Mirrors the cases in the backend's media-keys.spec.ts: if the two key schemes
// drift apart, the Lambda writes variants where the API does not look for them.
describe('keys', () => {
  it.each(['jpg', 'png', 'webp'])('parses an original .%s key', (extension) => {
    expect(parseOriginalKey(`original/products/${PRODUCT}/${MEDIA}.${extension}`)).toEqual({
      productId: PRODUCT,
      mediaId: MEDIA,
      extension,
    });
  });

  it.each([
    '',
    'original/products/x/y.jpg',
    `original/products/${PRODUCT}/${MEDIA}.gif`,
    `original/products/${PRODUCT}/${MEDIA}.jpg/extra`,
    `../original/products/${PRODUCT}/${MEDIA}.jpg`,
    `other/products/${PRODUCT}/${MEDIA}.jpg`,
    `original/products/ABCDEF12-1111-4111-8111-111111111111/${MEDIA}.jpg`,
  ])('does not parse a key it did not write: %s', (key) => {
    expect(parseOriginalKey(key)).toBeNull();
  });

  it('never matches a variant key, so the Lambda cannot trigger on its own output', () => {
    for (const name of Object.keys(VARIANT_WIDTHS) as (keyof typeof VARIANT_WIDTHS)[]) {
      expect(parseOriginalKey(variantKey(PRODUCT, MEDIA, name))).toBeNull();
    }
  });

  it('builds variant keys under the media id', () => {
    expect(variantKey(PRODUCT, MEDIA, 'medium')).toBe(
      `variants/products/${PRODUCT}/${MEDIA}/medium.webp`,
    );
  });

  it('decodes URL-encoded event keys, with + meaning a space', () => {
    expect(decodeEventKey('original%2Fproducts%2Fa+b.jpg')).toBe('original/products/a b.jpg');
  });
});
