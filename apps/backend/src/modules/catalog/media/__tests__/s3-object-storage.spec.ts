import { randomUUID } from 'crypto';

import { loadStorageConfig, type StorageConfig } from '../../../../config/storage.config';
import { ensureLocalBucket } from '../local-bucket';
import { S3ObjectStorage, createS3Client } from '../s3-object-storage.service';

// Integration test against a REAL S3-compatible server (the MinIO container),
// not a mock: what matters here is that S3 itself enforces the presigned POST
// policy (size, content type), and a mocked client would accept anything.
//
// Requires MinIO reachable: `docker compose up -d minio`. Uses its own bucket so
// it never touches the dev bucket. Override with TEST_S3_ENDPOINT.
jest.setTimeout(30_000);

const endpoint = process.env.TEST_S3_ENDPOINT ?? 'http://localhost:9000';
const BUCKET = 'golden-abode-media-test';

function config(): StorageConfig {
  return loadStorageConfig({
    S3_MEDIA_BUCKET: BUCKET,
    S3_ENDPOINT: endpoint,
    S3_FORCE_PATH_STYLE: 'true',
    S3_ACCESS_KEY_ID: process.env.TEST_S3_ACCESS_KEY ?? 'golden_dev',
    S3_SECRET_ACCESS_KEY: process.env.TEST_S3_SECRET_KEY ?? 'golden_dev_secret',
  });
}

const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

function jpegOfSize(bytes: number): Buffer {
  return Buffer.concat([JPEG_HEADER, Buffer.alloc(Math.max(0, bytes - JPEG_HEADER.length), 1)]);
}

// A browser form POST: policy fields first, the file LAST (S3 requires it).
async function postForm(
  url: string,
  fields: Record<string, string>,
  file: Buffer,
): Promise<Response> {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  form.append('file', new Blob([new Uint8Array(file)]), 'upload.jpg');
  return fetch(url, { method: 'POST', body: form });
}

describe('S3ObjectStorage (real MinIO)', () => {
  const cfg = config();
  const storage = new S3ObjectStorage(cfg);
  const keys: string[] = [];

  const newKey = (prefix = 'original/products') => {
    const key = `${prefix}/${randomUUID()}/${randomUUID()}.jpg`;
    keys.push(key);
    return key;
  };

  beforeAll(async () => {
    await ensureLocalBucket(createS3Client(cfg), BUCKET);
  });

  afterAll(async () => {
    await storage.deleteMany(keys);
  });

  describe('presignPost', () => {
    it('accepts an upload that matches the policy', async () => {
      const key = newKey();
      const post = await storage.presignPost({
        key,
        contentType: 'image/jpeg',
        maxBytes: 1024 * 1024,
        expiresInSeconds: 60,
      });

      const res = await postForm(post.url, post.fields, jpegOfSize(2048));
      expect(res.status).toBe(204);
      expect(await storage.head(key)).toMatchObject({
        contentLength: 2048,
        contentType: 'image/jpeg',
      });
    });

    it('makes S3 reject a file over the size limit', async () => {
      const key = newKey();
      const post = await storage.presignPost({
        key,
        contentType: 'image/jpeg',
        maxBytes: 1024,
        expiresInSeconds: 60,
      });

      const res = await postForm(post.url, post.fields, jpegOfSize(4096));
      expect(res.status).toBe(400);
      expect(await res.text()).toMatch(/EntityTooLarge|too large/i);
      expect(await storage.head(key)).toBeNull();
    });

    it('makes S3 reject a different Content-Type than the one presigned', async () => {
      const key = newKey();
      const post = await storage.presignPost({
        key,
        contentType: 'image/jpeg',
        maxBytes: 1024 * 1024,
        expiresInSeconds: 60,
      });

      const res = await postForm(
        post.url,
        { ...post.fields, 'Content-Type': 'text/html' },
        jpegOfSize(512),
      );
      expect(res.status).toBe(403);
      expect(await storage.head(key)).toBeNull();
    });

    it('makes S3 reject an upload to a different key', async () => {
      const key = newKey();
      const post = await storage.presignPost({
        key,
        contentType: 'image/jpeg',
        maxBytes: 1024 * 1024,
        expiresInSeconds: 60,
      });
      const otherKey = newKey();

      const res = await postForm(post.url, { ...post.fields, key: otherKey }, jpegOfSize(512));
      expect(res.status).toBe(403);
      expect(await storage.head(otherKey)).toBeNull();
    });
  });

  describe('objects', () => {
    it('head returns null for a missing object', async () => {
      expect(await storage.head(newKey())).toBeNull();
    });

    it('put then readRange returns exactly the requested bytes', async () => {
      const key = newKey();
      await storage.put(key, jpegOfSize(100), 'image/jpeg');
      const bytes = await storage.readRange(key, 0, 3);
      expect(bytes).toEqual(Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
    });

    it('lists objects under a prefix with their modified time', async () => {
      const prefix = `original/products/${randomUUID()}`;
      const key = `${prefix}/${randomUUID()}.jpg`;
      keys.push(key);
      await storage.put(key, jpegOfSize(64), 'image/jpeg');

      const page = await storage.list(prefix);
      expect(page.objects.map((o) => o.key)).toEqual([key]);
      expect(page.objects[0].size).toBe(64);
      expect(page.objects[0].lastModified).toBeInstanceOf(Date);
      expect(page.nextToken).toBeUndefined();
    });

    it('deleteMany removes objects and ignores keys that do not exist', async () => {
      const key = newKey();
      await storage.put(key, jpegOfSize(64), 'image/jpeg');
      await storage.deleteMany([key, newKey()]);
      expect(await storage.head(key)).toBeNull();
    });

    it('copyInPlace keeps the content and content type, and refuses a missing object', async () => {
      const key = newKey();
      await storage.put(key, jpegOfSize(200), 'image/jpeg');
      await storage.copyInPlace(key);
      expect(await storage.head(key)).toMatchObject({
        contentLength: 200,
        contentType: 'image/jpeg',
      });
      await expect(storage.copyInPlace(newKey())).rejects.toThrow(/missing object/);
    });
  });

  describe('bucket shape (mirrors production)', () => {
    it('serves variants/* anonymously but never original/*', async () => {
      const original = newKey('original/products');
      const variant = newKey('variants/products');
      await storage.put(original, jpegOfSize(64), 'image/jpeg');
      await storage.put(variant, jpegOfSize(64), 'image/jpeg');

      const base = `${endpoint}/${BUCKET}`;
      expect((await fetch(`${base}/${variant}`)).status).toBe(200);
      expect((await fetch(`${base}/${original}`)).status).toBe(403);
    });
  });
});
