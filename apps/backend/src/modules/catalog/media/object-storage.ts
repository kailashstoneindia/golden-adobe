// The storage boundary for product media (decision 0033). Business rules in
// MediaService depend on this interface, never on the AWS SDK, so the S3
// adapter is the only file that knows which cloud is behind it.

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

export type PresignPostInput = {
  key: string;
  contentType: string;
  // Enforced by S3 itself through the POST policy, not by the API.
  maxBytes: number;
  expiresInSeconds: number;
};

export type PresignedPost = {
  url: string;
  // Form fields the browser must send, in this order, with `file` LAST.
  fields: Record<string, string>;
};

export type ObjectHead = {
  contentLength: number;
  contentType?: string;
};

export type ListedObject = {
  key: string;
  size: number;
  lastModified: Date;
};

export type ListPage = {
  objects: ListedObject[];
  nextToken?: string;
};

// Applied to every object this app writes. Keys are immutable, so the CDN and
// browsers may cache them forever.
export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

export interface ObjectStorage {
  presignPost(input: PresignPostInput): Promise<PresignedPost>;
  // null when the object does not exist.
  head(key: string): Promise<ObjectHead | null>;
  // Inclusive byte range, like the HTTP Range header.
  readRange(key: string, start: number, end: number): Promise<Buffer>;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  // Rewrites the object onto itself. S3 emits a fresh ObjectCreated event, which
  // re-triggers the variants Lambda without re-uploading anything.
  copyInPlace(key: string): Promise<void>;
  // Missing keys are not an error. Throws if S3 reports a failure for any key.
  deleteMany(keys: string[]): Promise<void>;
  list(prefix: string, continuationToken?: string): Promise<ListPage>;
}
