import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

// The Lambda's whole view of storage: read an original, write a variant.
export interface ObjectStore {
  // null when the object does not exist.
  get(bucket: string, key: string): Promise<Buffer | null>;
  put(bucket: string, key: string, body: Buffer, contentType: string): Promise<void>;
}

// Variant keys never change once written (a new upload gets a new media id), so
// browsers and the CDN may cache them forever.
export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

type Env = Record<string, string | undefined>;

export function createS3Store(env: Env = process.env): ObjectStore {
  const client = new S3Client({
    region: env.AWS_REGION ?? 'ap-south-1',
    // All three below are unset on AWS: the Lambda's execution role supplies
    // credentials. They exist only to point local runs at MinIO.
    endpoint: env.S3_ENDPOINT || undefined,
    forcePathStyle: env.S3_FORCE_PATH_STYLE === 'true',
    credentials:
      env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
        ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY }
        : undefined,
  });

  return {
    async get(bucket, key) {
      try {
        const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        return Buffer.from(await out.Body!.transformToByteArray());
      } catch (error) {
        if ((error as { name?: string }).name === 'NoSuchKey') return null;
        throw error;
      }
    },

    async put(bucket, key, body, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          CacheControl: IMMUTABLE_CACHE_CONTROL,
        }),
      );
    },
  };
}
