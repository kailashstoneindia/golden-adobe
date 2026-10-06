import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';

import type { StorageConfig } from '../../../config/storage.config';
import {
  IMMUTABLE_CACHE_CONTROL,
  ListPage,
  ObjectHead,
  ObjectStorage,
  PresignedPost,
  PresignPostInput,
} from './object-storage';

const DELETE_BATCH = 1000;

export function createS3Client(config: StorageConfig, endpoint = config.endpoint): S3Client {
  return new S3Client({
    region: config.region,
    endpoint,
    forcePathStyle: config.forcePathStyle,
    // Both unset on AWS, so the SDK's default chain picks up the instance role.
    credentials:
      config.accessKeyId && config.secretAccessKey
        ? { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }
        : undefined,
  });
}

function isNotFound(error: unknown): boolean {
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === 'NotFound' || e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404;
}

export class S3ObjectStorage implements ObjectStorage {
  private readonly client: S3Client;
  private readonly presignClient: S3Client;

  constructor(private readonly config: StorageConfig) {
    this.client = createS3Client(config);
    // The browser may reach S3 under a different host than the API does.
    this.presignClient = config.presignEndpoint
      ? createS3Client(config, config.presignEndpoint)
      : this.client;
  }

  async presignPost(input: PresignPostInput): Promise<PresignedPost> {
    const result = await createPresignedPost(this.presignClient, {
      Bucket: this.config.bucket,
      Key: input.key,
      Expires: input.expiresInSeconds,
      // These two are echoed back as form fields; the policy conditions below
      // make S3 reject any upload that differs from them or exceeds the limit.
      Fields: {
        'Content-Type': input.contentType,
        'Cache-Control': IMMUTABLE_CACHE_CONTROL,
      },
      Conditions: [
        ['content-length-range', 1, input.maxBytes],
        ['eq', '$Content-Type', input.contentType],
        ['eq', '$Cache-Control', IMMUTABLE_CACHE_CONTROL],
      ],
    });
    return { url: result.url, fields: result.fields };
  }

  async head(key: string): Promise<ObjectHead | null> {
    try {
      const out = await this.client.send(
        new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );
      return { contentLength: out.ContentLength ?? 0, contentType: out.ContentType };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async readRange(key: string, start: number, end: number): Promise<Buffer> {
    const out = await this.client.send(
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Range: `bytes=${start}-${end}`,
      }),
    );
    return Buffer.from(await out.Body!.transformToByteArray());
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: IMMUTABLE_CACHE_CONTROL,
      }),
    );
  }

  async copyInPlace(key: string): Promise<void> {
    const head = await this.head(key);
    if (!head) throw new Error(`Cannot reprocess missing object ${key}`);
    // S3 refuses a copy onto itself unless something changes, hence REPLACE
    // with a fresh metadata value. REPLACE drops the old headers, so the ones
    // that matter are restated.
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        CopySource: `${this.config.bucket}/${encodeURI(key)}`,
        MetadataDirective: 'REPLACE',
        ContentType: head.contentType,
        CacheControl: IMMUTABLE_CACHE_CONTROL,
        Metadata: { 'reprocess-at': new Date().toISOString() },
      }),
    );
  }

  async deleteMany(keys: string[]): Promise<void> {
    for (let i = 0; i < keys.length; i += DELETE_BATCH) {
      const batch = keys.slice(i, i + DELETE_BATCH);
      const out = await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.config.bucket,
          Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
        }),
      );
      if (out.Errors && out.Errors.length > 0) {
        const detail = out.Errors.map((e) => `${e.Key}: ${e.Code}`).join(', ');
        throw new Error(`Failed to delete ${out.Errors.length} object(s): ${detail}`);
      }
    }
  }

  async list(prefix: string, continuationToken?: string): Promise<ListPage> {
    const out = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.config.bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      }),
    );
    return {
      objects: (out.Contents ?? []).map((o) => ({
        key: o.Key!,
        size: o.Size ?? 0,
        lastModified: o.LastModified ?? new Date(0),
      })),
      nextToken: out.IsTruncated ? out.NextContinuationToken : undefined,
    };
  }
}
