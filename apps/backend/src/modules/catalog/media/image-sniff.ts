import type { MediaContentType } from './media-keys';

// Identifies an image by its leading bytes. The declared Content-Type and the
// file extension are both client-controlled, so confirm trusts neither: it
// reads the first bytes of the stored object and compares. Three formats are
// checked by hand rather than pulling in the ESM-only `file-type` package.
//
// 12 bytes are enough for all three; callers read a few more for safety.
export const SNIFF_BYTES = 16;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(buf: Buffer, bytes: number[], offset = 0): boolean {
  if (buf.length < offset + bytes.length) return false;
  return bytes.every((b, i) => buf[offset + i] === b);
}

export function sniffImageType(buf: Buffer): MediaContentType | null {
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(buf, PNG_SIGNATURE)) return 'image/png';
  // WebP is a RIFF container: "RIFF" <4-byte size> "WEBP".
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)) {
    return 'image/webp';
  }
  return null;
}
