// Media storage configuration (decision 0033). Every host, bucket and key is
// configuration, never code: moving from the local MinIO container to AWS is an
// environment change only, the same rule 0021 set for Meilisearch.

export type StorageConfig = {
  // False when S3_MEDIA_BUCKET is unset. The app still boots (the Railway demo
  // has no bucket) and the media endpoints answer 503 instead of crashing it.
  enabled: boolean;
  region: string;
  bucket: string;
  // Unset on AWS. Set to the MinIO URL locally.
  endpoint?: string;
  forcePathStyle: boolean;
  // Browser-reachable endpoint used only when presigning, for when the API runs
  // inside Docker and reaches S3 under a different hostname than the browser.
  presignEndpoint?: string;
  // Explicit credentials, for MinIO. Unset on AWS: the instance role is picked
  // up by the SDK's default chain, so no long-lived keys exist there.
  accessKeyId?: string;
  secretAccessKey?: string;
  // CloudFront domain on AWS, the MinIO bucket URL locally. No trailing slash.
  publicBaseUrl: string;
  maxUploadBytes: number;
  maxPerProduct: number;
  presignTtlSeconds: number;
  // Shared with the media Lambda; signs its processing-result callback.
  callbackSecret: string;
  // A row still 'processing' after this long is reported as failed on read.
  processingTimeoutSeconds: number;
};

type Env = Record<string, string | undefined>;

export const DEV_CALLBACK_SECRET = 'local_dev_media_callback_secret_change_me';
export const MIN_CALLBACK_SECRET_LENGTH = 32;

function optional(env: Env, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

function positiveInt(env: Env, name: string, fallback: number): number {
  const raw = optional(env, name);
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer, got "${raw}"`);
  }
  return parsed;
}

export function loadStorageConfig(env: Env = process.env): StorageConfig {
  const production = env.NODE_ENV === 'production';
  const bucket = optional(env, 'S3_MEDIA_BUCKET') ?? '';
  const endpoint = optional(env, 'S3_ENDPOINT');

  const publicBaseUrl = (
    optional(env, 'MEDIA_PUBLIC_BASE_URL') ??
    (!production && endpoint && bucket ? `${endpoint}/${bucket}` : '')
  ).replace(/\/+$/, '');

  const callbackSecret =
    optional(env, 'MEDIA_CALLBACK_SECRET') ?? (production ? '' : DEV_CALLBACK_SECRET);

  const config: StorageConfig = {
    enabled: bucket !== '',
    region: optional(env, 'AWS_REGION') ?? 'ap-south-1',
    bucket,
    endpoint,
    forcePathStyle: env.S3_FORCE_PATH_STYLE === 'true',
    presignEndpoint: optional(env, 'S3_PRESIGN_ENDPOINT'),
    accessKeyId: optional(env, 'S3_ACCESS_KEY_ID'),
    secretAccessKey: optional(env, 'S3_SECRET_ACCESS_KEY'),
    publicBaseUrl,
    maxUploadBytes: positiveInt(env, 'MEDIA_MAX_UPLOAD_BYTES', 10 * 1024 * 1024),
    maxPerProduct: positiveInt(env, 'MEDIA_MAX_PER_PRODUCT', 20),
    presignTtlSeconds: positiveInt(env, 'MEDIA_PRESIGN_TTL_SECONDS', 300),
    callbackSecret,
    processingTimeoutSeconds: positiveInt(env, 'MEDIA_PROCESSING_TIMEOUT_SECONDS', 600),
  };

  // Fail at boot rather than on the first upload, but only for a deployment
  // that opted in by setting a bucket.
  if (config.enabled) {
    const problems: string[] = [];
    if (!config.publicBaseUrl) problems.push('MEDIA_PUBLIC_BASE_URL is required');
    if (config.callbackSecret.length < MIN_CALLBACK_SECRET_LENGTH) {
      problems.push(
        `MEDIA_CALLBACK_SECRET must be at least ${MIN_CALLBACK_SECRET_LENGTH} characters`,
      );
    }
    if (Boolean(config.accessKeyId) !== Boolean(config.secretAccessKey)) {
      problems.push('S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be set together');
    }
    if (problems.length > 0) {
      throw new Error(`Invalid media storage configuration: ${problems.join('; ')}`);
    }
  }

  return config;
}
