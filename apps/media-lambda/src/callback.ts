import { createHmac } from 'crypto';

import type { LambdaConfig } from './config';

// Signs and sends the processing result to the API (decision 0033).
//
//   X-Media-Timestamp: <unix seconds>
//   X-Media-Signature: sha256=<hex HMAC-SHA256(secret, `${timestamp}.${rawBody}`)>
//
// Mirrors apps/backend/src/modules/catalog/media/media-callback-signature.ts;
// both test suites assert the same shared vector.

export type ProcessingResult = { status: 'ready' } | { status: 'failed'; reason: string };

export function computeSignature(secret: string, timestamp: string, rawBody: string): string {
  const hex = createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest('hex');
  return `sha256=${hex}`;
}

// Any non-2xx or network failure. The handler lets it propagate so S3 retries the
// invocation (and finally parks it in the dead-letter queue): a 404 means the
// confirm request has not committed yet, a 401 means a misconfigured secret.
export class CallbackError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'CallbackError';
  }
}

export async function sendResult(
  config: LambdaConfig,
  mediaId: string,
  result: ProcessingResult,
  fetchImpl: typeof fetch = fetch,
  nowMs: () => number = Date.now,
): Promise<void> {
  const body = JSON.stringify(result);
  const timestamp = String(Math.floor(nowMs() / 1000));
  const url = `${config.apiCallbackBaseUrl}/api/internal/media/${mediaId}/processing-result`;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Media-Timestamp': timestamp,
        'X-Media-Signature': computeSignature(config.callbackSecret, timestamp, body),
      },
      body,
      signal: AbortSignal.timeout(config.callbackTimeoutMs),
    });
  } catch (error) {
    throw new CallbackError(`callback request failed: ${String(error)}`);
  }

  if (!response.ok) {
    throw new CallbackError(`callback answered ${response.status}`, response.status);
  }
}
