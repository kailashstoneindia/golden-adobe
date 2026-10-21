import { randomUUID } from 'crypto';
import http from 'node:http';
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { computeSignature, sendResult } from '../src/callback';
import { loadConfig } from '../src/config';
import { createHandler, type S3Event } from '../src/handler';
import { variantKey } from '../src/keys';
import { createS3Store, type ObjectStore } from '../src/s3';
import { jpeg, truncatedJpeg } from './images';

// The handler against a REAL MinIO (docker compose up -d minio) and a stub API
// that checks every callback's signature. Nothing about S3 is mocked.

const BUCKET = 'golden-abode-media-lambda-test';
const SECRET = 'handler-test-secret-handler-test-secret';

const s3Env = {
  S3_ENDPOINT: process.env.TEST_S3_ENDPOINT ?? 'http://localhost:9000',
  S3_FORCE_PATH_STYLE: 'true',
  S3_ACCESS_KEY_ID: process.env.TEST_S3_ACCESS_KEY ?? 'golden_dev',
  S3_SECRET_ACCESS_KEY: process.env.TEST_S3_SECRET_KEY ?? 'golden_dev_secret',
};

type Call = { path: string; body: string; timestamp: string; signature: string };

// Stands in for the NestJS API. `answers` is consumed one status per request;
// once empty it answers 200.
function startStubApi() {
  const calls: Call[] = [];
  const answers: number[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      calls.push({
        path: req.url ?? '',
        body: Buffer.concat(chunks).toString('utf8'),
        timestamp: String(req.headers['x-media-timestamp']),
        signature: String(req.headers['x-media-signature']),
      });
      res.writeHead(answers.shift() ?? 200).end();
    });
  });
  return new Promise<{ url: string; calls: Call[]; answers: number[]; close: () => Promise<void> }>(
    (resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const { port } = server.address() as { port: number };
        resolve({
          url: `http://127.0.0.1:${port}`,
          calls,
          answers,
          close: () => new Promise((done) => server.close(() => done())),
        });
      });
    },
  );
}

describe('media Lambda handler (real MinIO, stub API)', () => {
  const store: ObjectStore = createS3Store(s3Env);
  let api: Awaited<ReturnType<typeof startStubApi>>;

  const handlerFor = (overrides: { store?: ObjectStore } = {}) => {
    const config = loadConfig({
      API_CALLBACK_BASE_URL: api.url,
      MEDIA_CALLBACK_SECRET: SECRET,
      MAX_SOURCE_BYTES: String(200_000),
      VARIANTS_MAX_INPUT_PIXELS: '5000000',
    });
    return createHandler({
      store: overrides.store ?? store,
      config,
      notify: (mediaId, result) => sendResult(config, mediaId, result),
      log: () => undefined,
    });
  };

  function newImage() {
    const productId = randomUUID();
    const mediaId = randomUUID();
    return { productId, mediaId, key: `original/products/${productId}/${mediaId}.jpg` };
  }

  const eventFor = (key: string, size?: number): S3Event => ({
    Records: [{ s3: { bucket: { name: BUCKET }, object: { key, size } } }],
  });

  async function readVariant(
    productId: string,
    mediaId: string,
    name: 'thumb' | 'medium' | 'large',
  ) {
    const body = await store.get(BUCKET, variantKey(productId, mediaId, name));
    return body ? sharp(body).metadata() : null;
  }

  beforeAll(async () => {
    const admin = new S3Client({
      region: 'ap-south-1',
      endpoint: s3Env.S3_ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: s3Env.S3_ACCESS_KEY_ID,
        secretAccessKey: s3Env.S3_SECRET_ACCESS_KEY,
      },
    });
    try {
      await admin.send(new CreateBucketCommand({ Bucket: BUCKET }));
    } catch (error) {
      if ((error as { name?: string }).name !== 'BucketAlreadyOwnedByYou') throw error;
    }
  });

  beforeEach(async () => {
    api = await startStubApi();
  });

  afterAll(async () => {
    await api?.close();
  });

  it('writes the three variants and reports ready with a valid signature', async () => {
    const { productId, mediaId, key } = newImage();
    await store.put(BUCKET, key, await jpeg(2000, 1500), 'image/jpeg');

    await handlerFor()(eventFor(key));

    expect(await readVariant(productId, mediaId, 'thumb')).toMatchObject({
      format: 'webp',
      width: 200,
    });
    expect(await readVariant(productId, mediaId, 'medium')).toMatchObject({
      format: 'webp',
      width: 600,
    });
    expect(await readVariant(productId, mediaId, 'large')).toMatchObject({
      format: 'webp',
      width: 1200,
    });

    expect(api.calls).toHaveLength(1);
    const [call] = api.calls;
    expect(call.path).toBe(`/api/internal/media/${mediaId}/processing-result`);
    expect(call.body).toBe('{"status":"ready"}');
    expect(call.signature).toBe(computeSignature(SECRET, call.timestamp, call.body));
  });

  it('ignores variant keys and keys it did not write, so it cannot trigger on its own output', async () => {
    const { productId, mediaId } = newImage();
    const counting = { gets: 0 };
    const spy: ObjectStore = {
      get: async (...args) => {
        counting.gets++;
        return store.get(...args);
      },
      put: store.put,
    };
    const handler = handlerFor({ store: spy });

    await handler(eventFor(variantKey(productId, mediaId, 'thumb')));
    await handler(eventFor('uploads/random.jpg'));
    await handler({ Records: [] });

    expect(counting.gets).toBe(0);
    expect(api.calls).toHaveLength(0);
  });

  it.each([
    ['a corrupt JPEG', () => truncatedJpeg()],
    ['text renamed to .jpg', async () => Buffer.from('not an image at all')],
  ])('reports %s as a failed image without throwing or writing variants', async (_name, make) => {
    const { productId, mediaId, key } = newImage();
    await store.put(BUCKET, key, await make(), 'image/jpeg');

    await expect(handlerFor()(eventFor(key))).resolves.toBeUndefined();

    expect(await readVariant(productId, mediaId, 'thumb')).toBeNull();
    expect(api.calls).toHaveLength(1);
    expect(JSON.parse(api.calls[0].body)).toMatchObject({ status: 'failed' });
    expect(JSON.parse(api.calls[0].body).reason).toMatch(/could not be read/);
  });

  it('fails an oversized file from the event alone, without reading it', async () => {
    const { key } = newImage();
    const neverRead: ObjectStore = {
      get: async () => {
        throw new Error('should not be read');
      },
      put: store.put,
    };

    await handlerFor({ store: neverRead })(eventFor(key, 5_000_000));

    expect(JSON.parse(api.calls[0].body)).toEqual({
      status: 'failed',
      reason: 'the file is too large',
    });
  });

  it('checks the real size too when the event does not carry one', async () => {
    const { key } = newImage();
    await store.put(BUCKET, key, Buffer.alloc(300_000, 1), 'image/jpeg');

    await handlerFor()(eventFor(key));

    expect(JSON.parse(api.calls[0].body)).toEqual({
      status: 'failed',
      reason: 'the file is too large',
    });
  });

  it('does nothing when the original was deleted before it ran', async () => {
    const { key } = newImage();

    await expect(handlerFor()(eventFor(key))).resolves.toBeUndefined();

    expect(api.calls).toHaveLength(0);
  });

  it('throws when the API answers 404, so S3 retries once confirm has committed', async () => {
    const { productId, mediaId, key } = newImage();
    await store.put(BUCKET, key, await jpeg(800, 600), 'image/jpeg');
    api.answers.push(404);

    await expect(handlerFor()(eventFor(key))).rejects.toMatchObject({
      name: 'CallbackError',
      status: 404,
    });
    // The variants were already written, so the retry has nothing left to do but report.
    expect(await readVariant(productId, mediaId, 'large')).not.toBeNull();

    await expect(handlerFor()(eventFor(key))).resolves.toBeUndefined();
    expect(api.calls).toHaveLength(2);
    expect(JSON.parse(api.calls[1].body)).toEqual({ status: 'ready' });
  });

  it.each([401, 500])('throws when the API answers %i', async (status) => {
    const { key } = newImage();
    await store.put(BUCKET, key, await jpeg(400, 300), 'image/jpeg');
    api.answers.push(status);

    await expect(handlerFor()(eventFor(key))).rejects.toMatchObject({ status });
  });

  it('handles a URL-encoded key from the event', async () => {
    const { productId, mediaId, key } = newImage();
    await store.put(BUCKET, key, await jpeg(400, 300), 'image/jpeg');

    await handlerFor()(eventFor(key.replaceAll('/', '%2F')));

    expect(await readVariant(productId, mediaId, 'thumb')).not.toBeNull();
    expect(api.calls).toHaveLength(1);
  });

  it('is idempotent: running the same upload twice gives the same variants', async () => {
    const { productId, mediaId, key } = newImage();
    await store.put(BUCKET, key, await jpeg(1600, 900), 'image/jpeg');
    const handler = handlerFor();

    await handler(eventFor(key));
    await handler(eventFor(key));

    expect(await readVariant(productId, mediaId, 'medium')).toMatchObject({ width: 600 });
    expect(api.calls).toHaveLength(2);
  });
});
