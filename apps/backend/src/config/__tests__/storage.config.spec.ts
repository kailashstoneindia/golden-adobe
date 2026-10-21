import { DEV_CALLBACK_SECRET, loadStorageConfig } from '../storage.config';

const PROD_SECRET = 'a'.repeat(40);

describe('loadStorageConfig', () => {
  it('is disabled, not an error, when no bucket is set (the Railway demo case)', () => {
    const config = loadStorageConfig({ NODE_ENV: 'production' });
    expect(config.enabled).toBe(false);
  });

  it('derives local defaults from a bucket and an endpoint outside production', () => {
    const config = loadStorageConfig({
      S3_MEDIA_BUCKET: 'media',
      S3_ENDPOINT: 'http://localhost:9000',
    });
    expect(config.enabled).toBe(true);
    expect(config.publicBaseUrl).toBe('http://localhost:9000/media');
    expect(config.callbackSecret).toBe(DEV_CALLBACK_SECRET);
    expect(config.region).toBe('ap-south-1');
    expect(config.maxUploadBytes).toBe(10 * 1024 * 1024);
    expect(config.maxPerProduct).toBe(20);
    expect(config.presignTtlSeconds).toBe(300);
    expect(config.processingTimeoutSeconds).toBe(600);
  });

  it('does not invent a public URL or a secret in production', () => {
    expect(() => loadStorageConfig({ NODE_ENV: 'production', S3_MEDIA_BUCKET: 'media' })).toThrow(
      /MEDIA_PUBLIC_BASE_URL.*MEDIA_CALLBACK_SECRET/,
    );
  });

  it('refuses a short callback secret', () => {
    expect(() =>
      loadStorageConfig({
        NODE_ENV: 'production',
        S3_MEDIA_BUCKET: 'media',
        MEDIA_PUBLIC_BASE_URL: 'https://cdn.example.com',
        MEDIA_CALLBACK_SECRET: 'too-short',
      }),
    ).toThrow(/at least 32 characters/);
  });

  it('accepts a complete production configuration and trims the trailing slash', () => {
    const config = loadStorageConfig({
      NODE_ENV: 'production',
      S3_MEDIA_BUCKET: 'media',
      MEDIA_PUBLIC_BASE_URL: 'https://cdn.example.com//',
      MEDIA_CALLBACK_SECRET: PROD_SECRET,
    });
    expect(config.publicBaseUrl).toBe('https://cdn.example.com');
    expect(config.endpoint).toBeUndefined();
    expect(config.accessKeyId).toBeUndefined();
  });

  it('requires access key and secret together', () => {
    expect(() =>
      loadStorageConfig({
        S3_MEDIA_BUCKET: 'media',
        S3_ENDPOINT: 'http://localhost:9000',
        S3_ACCESS_KEY_ID: 'only-the-id',
      }),
    ).toThrow(/set together/);
  });

  it('rejects numeric settings that are not positive integers', () => {
    expect(() => loadStorageConfig({ MEDIA_MAX_UPLOAD_BYTES: 'lots' })).toThrow(
      /MEDIA_MAX_UPLOAD_BYTES/,
    );
    expect(() => loadStorageConfig({ MEDIA_MAX_PER_PRODUCT: '0' })).toThrow(
      /MEDIA_MAX_PER_PRODUCT/,
    );
    expect(() => loadStorageConfig({ MEDIA_PRESIGN_TTL_SECONDS: '-5' })).toThrow(
      /MEDIA_PRESIGN_TTL_SECONDS/,
    );
  });

  it('reads path-style addressing and the presign endpoint override', () => {
    const config = loadStorageConfig({
      S3_MEDIA_BUCKET: 'media',
      S3_ENDPOINT: 'http://minio:9000',
      S3_PRESIGN_ENDPOINT: 'http://localhost:9000',
      S3_FORCE_PATH_STYLE: 'true',
    });
    expect(config.forcePathStyle).toBe(true);
    expect(config.presignEndpoint).toBe('http://localhost:9000');
  });
});
