import { createHmac, timingSafeEqual } from 'crypto';

// Signature scheme for the media Lambda's callback (decision 0033):
//
//   X-Media-Timestamp: <unix seconds>
//   X-Media-Signature: sha256=<hex HMAC-SHA256(secret, `${timestamp}.${rawBody}`)>
//
// Pure functions, so the Lambda package can mirror them and both test suites
// can assert against one shared test vector.

export const SIGNATURE_PREFIX = 'sha256=';
// How far a timestamp may drift from now before the request is treated as a
// replay. Lambda retries sign afresh, so this only has to cover clock skew.
export const MAX_CLOCK_SKEW_SECONDS = 300;

export function computeSignature(secret: string, timestamp: string, rawBody: Buffer): string {
  const hex = createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest('hex');
  return `${SIGNATURE_PREFIX}${hex}`;
}

export function isFreshTimestamp(timestamp: string, nowSeconds: number): boolean {
  if (!/^\d{1,12}$/.test(timestamp)) return false;
  return Math.abs(nowSeconds - Number(timestamp)) <= MAX_CLOCK_SKEW_SECONDS;
}

// Constant-time comparison. A length mismatch is rejected first because
// timingSafeEqual throws on unequal lengths.
export function signaturesMatch(expected: string, provided: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}
