import sharp from 'sharp';

import { VARIANT_WIDTHS, type VariantName } from './keys';

// Turns one uploaded original into the three WebP variants (decision 0033).

export type Variant = { name: VariantName; width: number; body: Buffer };

// The image itself is the problem (corrupt, unsupported, too large). The handler
// reports these to the API as a failed image and does NOT retry, because
// retrying the same bytes can never succeed. Anything else is thrown as-is.
export class ImageProcessingError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = 'ImageProcessingError';
  }
}

const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp']);

export async function generateVariants(
  input: Buffer,
  options: { maxInputPixels: number },
): Promise<Variant[]> {
  try {
    // failOn 'error' makes a truncated file fail instead of rendering half an image.
    const image = sharp(input, { limitInputPixels: options.maxInputPixels, failOn: 'error' });

    // The declared type is client-supplied and sharp reads more formats than we
    // accept (GIF, SVG, TIFF), so the real format is checked here.
    const meta = await image.metadata();
    if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) {
      throw new ImageProcessingError('the file is not a JPEG, PNG or WebP image');
    }

    // rotate() applies the EXIF orientation. Metadata (EXIF, GPS) is dropped
    // because sharp strips it unless withMetadata() is called.
    const oriented = image.rotate();

    const variants: Variant[] = [];
    for (const [name, width] of Object.entries(VARIANT_WIDTHS) as [VariantName, number][]) {
      const body = await oriented
        .clone()
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 80, effort: 4 })
        .toBuffer();
      variants.push({ name, width, body });
    }
    return variants;
  } catch (error) {
    if (error instanceof ImageProcessingError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    // The message goes to an admin screen: classify it, never pass sharp's text through.
    if (/pixel limit|exceeds/i.test(message)) {
      throw new ImageProcessingError('the image dimensions are too large');
    }
    throw new ImageProcessingError('the image could not be read (corrupt or unsupported)');
  }
}
