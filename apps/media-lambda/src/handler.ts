import type { ProcessingResult } from './callback';
import type { LambdaConfig } from './config';
import { decodeEventKey, parseOriginalKey, variantKey } from './keys';
import type { ObjectStore } from './s3';
import { ImageProcessingError, generateVariants } from './variants';

// S3 (and MinIO's webhook) deliver this shape. Only what is used is typed.
export type S3EventRecord = {
  s3: { bucket: { name: string }; object: { key: string; size?: number } };
};
export type S3Event = { Records: S3EventRecord[] };

export type HandlerDeps = {
  store: ObjectStore;
  config: LambdaConfig;
  // Reports the outcome to the API. Throws if the API does not accept it.
  notify: (mediaId: string, result: ProcessingResult) => Promise<void>;
  log?: (entry: Record<string, unknown>) => void;
};

// Builds the Lambda handler (decision 0033). For each uploaded original it writes
// three WebP variants, then tells the API.
//
// What happens to a failure decides whether S3 retries, so it matters:
//   - the IMAGE is bad (corrupt, wrong format, too big): reported to the API as a
//     failed image and the invocation SUCCEEDS. Retrying the same bytes can never
//     work, and the admin sees "failed" within seconds.
//   - anything else (S3 hiccup, the API unreachable, the API answering 404
//     because confirm has not committed yet): the error is thrown, so S3 retries
//     and finally parks the event in the dead-letter queue.
//   - a key this system did not write, or an original that was deleted in the
//     meantime: ignored, with a log line.
export function createHandler(deps: HandlerDeps) {
  const { store, config, notify } = deps;
  const log = deps.log ?? ((entry) => console.log(JSON.stringify(entry)));

  async function processRecord(record: S3EventRecord): Promise<void> {
    const bucket = record.s3.bucket.name;
    const key = decodeEventKey(record.s3.object.key);

    // Also what stops the Lambda re-triggering on its own variants: they never match.
    const parsed = parseOriginalKey(key);
    if (!parsed) {
      log({ event: 'ignored', key, reason: 'not an original this system wrote' });
      return;
    }
    const { productId, mediaId } = parsed;

    const tooLarge = (): Promise<void> =>
      notify(mediaId, { status: 'failed', reason: 'the file is too large' });

    const declared = record.s3.object.size;
    if (declared !== undefined && declared > config.maxSourceBytes) {
      await tooLarge();
      log({ event: 'failed', key, reason: 'too large', size: declared });
      return;
    }

    const original = await store.get(bucket, key);
    if (!original) {
      log({ event: 'ignored', key, reason: 'original no longer exists' });
      return;
    }
    // The event may omit the size, so the bytes are checked too.
    if (original.length > config.maxSourceBytes) {
      await tooLarge();
      log({ event: 'failed', key, reason: 'too large', size: original.length });
      return;
    }

    let variants;
    try {
      variants = await generateVariants(original, { maxInputPixels: config.maxInputPixels });
    } catch (error) {
      if (!(error instanceof ImageProcessingError)) throw error;
      await notify(mediaId, { status: 'failed', reason: error.reason });
      log({ event: 'failed', key, reason: error.reason });
      return;
    }

    await Promise.all(
      variants.map((v) =>
        store.put(bucket, variantKey(productId, mediaId, v.name), v.body, 'image/webp'),
      ),
    );
    await notify(mediaId, { status: 'ready' });
    log({ event: 'processed', key, variants: variants.map((v) => v.name) });
  }

  return async function handler(event: S3Event): Promise<void> {
    for (const record of event.Records ?? []) {
      await processRecord(record);
    }
  };
}
