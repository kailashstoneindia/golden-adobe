import { sniffImageType } from '../image-sniff';

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const webp = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from('WEBPVP8 '),
]);

describe('sniffImageType', () => {
  it('recognises JPEG, PNG and WebP by their leading bytes', () => {
    expect(sniffImageType(jpeg)).toBe('image/jpeg');
    expect(sniffImageType(png)).toBe('image/png');
    expect(sniffImageType(webp)).toBe('image/webp');
  });

  it('rejects text renamed to .jpg', () => {
    expect(sniffImageType(Buffer.from('this is definitely not an image'))).toBeNull();
  });

  it('rejects a PDF, a GIF and an HTML page', () => {
    expect(sniffImageType(Buffer.from('%PDF-1.7 ......'))).toBeNull();
    expect(sniffImageType(Buffer.from('GIF89a......'))).toBeNull();
    expect(sniffImageType(Buffer.from('<html><script>'))).toBeNull();
  });

  it('rejects a RIFF container that is not WebP (a WAV file)', () => {
    const wav = Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.from([0, 0, 0, 0]),
      Buffer.from('WAVEfmt '),
    ]);
    expect(sniffImageType(wav)).toBeNull();
  });

  it('rejects truncated and empty input instead of throwing', () => {
    expect(sniffImageType(Buffer.alloc(0))).toBeNull();
    expect(sniffImageType(Buffer.from([0xff, 0xd8]))).toBeNull();
    expect(sniffImageType(png.subarray(0, 5))).toBeNull();
    expect(sniffImageType(Buffer.from('RIFF....WEB'))).toBeNull();
  });
});
