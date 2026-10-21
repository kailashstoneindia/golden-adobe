import { loadStorageConfig, type StorageConfig } from '../../../../config/storage.config';

// Shared by the media integration specs. They run against the REAL MinIO
// container (`docker compose up -d minio`), never a mock: what matters is that
// S3 itself enforces the presigned POST policy.

export const TEST_ENDPOINT = process.env.TEST_S3_ENDPOINT ?? 'http://localhost:9000';
export const TEST_BUCKET = 'golden-abode-media-test';

export function testStorageConfig(
  overrides: Record<string, string> = {},
  bucket = TEST_BUCKET,
): StorageConfig {
  return loadStorageConfig({
    S3_MEDIA_BUCKET: bucket,
    S3_ENDPOINT: TEST_ENDPOINT,
    S3_FORCE_PATH_STYLE: 'true',
    S3_ACCESS_KEY_ID: process.env.TEST_S3_ACCESS_KEY ?? 'golden_dev',
    S3_SECRET_ACCESS_KEY: process.env.TEST_S3_SECRET_KEY ?? 'golden_dev_secret',
    ...overrides,
  });
}

export const JPEG_HEADER = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46,
]);

// Starts like a JPEG, so it passes the magic-byte check, then pads to a size.
export function jpegOfSize(bytes: number): Buffer {
  return Buffer.concat([JPEG_HEADER, Buffer.alloc(Math.max(0, bytes - JPEG_HEADER.length), 1)]);
}

// A browser form POST: policy fields first, the file LAST (S3 requires it).
export async function postForm(
  url: string,
  fields: Record<string, string>,
  file: Buffer,
): Promise<Response> {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  form.append('file', new Blob([new Uint8Array(file)]), 'upload.jpg');
  return fetch(url, { method: 'POST', body: form });
}
