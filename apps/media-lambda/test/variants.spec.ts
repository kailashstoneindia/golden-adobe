import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { ImageProcessingError, generateVariants } from '../src/variants';
import { gif, jpeg, jpegWithExif, png, rotatedJpeg, truncatedJpeg, webp } from './images';

const options = { maxInputPixels: 40_000_000 };

async function describeOutput(buffers: { body: Buffer }[]) {
  return Promise.all(
    buffers.map(async ({ body }) => {
      const meta = await sharp(body).metadata();
      return { format: meta.format, width: meta.width, height: meta.height };
    }),
  );
}

describe('generateVariants', () => {
  it('makes thumb, medium and large WebP files 200, 600 and 1200 pixels wide', async () => {
    const variants = await generateVariants(await jpeg(2400, 1600), options);

    expect(variants.map((v) => v.name)).toEqual(['thumb', 'medium', 'large']);
    expect(await describeOutput(variants)).toEqual([
      { format: 'webp', width: 200, height: 133 },
      { format: 'webp', width: 600, height: 400 },
      { format: 'webp', width: 1200, height: 800 },
    ]);
  });

  it('accepts PNG and WebP originals too', async () => {
    for (const input of [await png(1500, 1000), await webp(1500, 1000)]) {
      const variants = await generateVariants(input, options);
      expect((await describeOutput(variants)).map((v) => v.width)).toEqual([200, 600, 1200]);
    }
  });

  it('never enlarges a small image', async () => {
    const variants = await generateVariants(await jpeg(100, 50), options);

    expect(await describeOutput(variants)).toEqual([
      { format: 'webp', width: 100, height: 50 },
      { format: 'webp', width: 100, height: 50 },
      { format: 'webp', width: 100, height: 50 },
    ]);
  });

  it('turns a sideways phone photo upright using its EXIF orientation', async () => {
    // Stored 400 wide by 200 tall, but meant to be viewed 200 wide by 400 tall.
    const [thumb] = await describeOutput(
      await generateVariants(await rotatedJpeg(400, 200), options),
    );

    expect(thumb.height).toBeGreaterThan(thumb.width!);
  });

  it('strips EXIF, so GPS and camera details are never served', async () => {
    const input = await jpegWithExif(800, 600);
    expect((await sharp(input).metadata()).exif).toBeDefined();

    for (const variant of await generateVariants(input, options)) {
      expect((await sharp(variant.body).metadata()).exif).toBeUndefined();
    }
  });

  it.each([
    ['a truncated JPEG', () => truncatedJpeg(), /could not be read/],
    [
      'text renamed to .jpg',
      async () => Buffer.from('definitely not an image'),
      /could not be read/,
    ],
    ['an empty file', async () => Buffer.alloc(0), /could not be read/],
    ['a GIF', () => gif(50, 50), /not a JPEG, PNG or WebP/],
  ])('reports %s as an image problem, not a crash', async (_name, make, reason) => {
    const error = await generateVariants(await make(), options).catch((e) => e);

    expect(error).toBeInstanceOf(ImageProcessingError);
    expect(error.reason).toMatch(reason);
  });

  it('refuses an image with more pixels than allowed (decompression bomb guard)', async () => {
    const error = await generateVariants(await jpeg(100, 100), { maxInputPixels: 1000 }).catch(
      (e) => e,
    );

    expect(error).toBeInstanceOf(ImageProcessingError);
    expect(error.reason).toMatch(/dimensions are too large/);
  });

  it('never passes the image library error text through to the admin', async () => {
    const error = await generateVariants(Buffer.from('garbage'), options).catch((e) => e);

    expect(error.reason).not.toMatch(/vips|sharp|buffer/i);
  });
});
