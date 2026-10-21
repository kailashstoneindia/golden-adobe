import sharp from 'sharp';

// Test images are generated, not committed: no binary fixtures to review or rot.

const background = { r: 200, g: 100, b: 50 };

function blank(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background } });
}

export const jpeg = (width: number, height: number) => blank(width, height).jpeg().toBuffer();
export const png = (width: number, height: number) => blank(width, height).png().toBuffer();
export const webp = (width: number, height: number) => blank(width, height).webp().toBuffer();
export const gif = (width: number, height: number) => blank(width, height).gif().toBuffer();

// Stored sideways with EXIF orientation 6, so it must be turned upright.
export const rotatedJpeg = (width: number, height: number) =>
  blank(width, height).jpeg().withMetadata({ orientation: 6 }).toBuffer();

// Carries personal-looking EXIF that must not survive processing.
export const jpegWithExif = (width: number, height: number) =>
  blank(width, height)
    .jpeg()
    .withExif({ IFD0: { Copyright: 'private-photographer' } })
    .toBuffer();

// A valid JPEG header followed by a cut-off body.
export async function truncatedJpeg(): Promise<Buffer> {
  const whole = await jpeg(800, 600);
  return whole.subarray(0, Math.floor(whole.length / 2));
}
