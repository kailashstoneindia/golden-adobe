import {
  MAX_CLOCK_SKEW_SECONDS,
  computeSignature,
  isFreshTimestamp,
  signaturesMatch,
} from '../media-callback-signature';

// The same vector is asserted in the media Lambda's tests. If either side's
// signing changes, one of the two suites fails.
export const SHARED_TEST_VECTOR = {
  secret: 'test-secret-test-secret-test-secret-1234',
  timestamp: '1700000000',
  body: '{"status":"ready"}',
  signature: 'sha256=3d5c053dfeccf4a9124d984b4086aef3cfb50fa298254c03218f9016991f3ef7',
};

describe('media callback signature', () => {
  it('matches the shared test vector', () => {
    const { secret, timestamp, body, signature } = SHARED_TEST_VECTOR;
    expect(computeSignature(secret, timestamp, Buffer.from(body))).toBe(signature);
  });

  it('changes when the body, the timestamp or the secret changes', () => {
    const { secret, timestamp, body, signature } = SHARED_TEST_VECTOR;
    expect(computeSignature(secret, timestamp, Buffer.from('{"status":"failed"}'))).not.toBe(
      signature,
    );
    expect(computeSignature(secret, '1700000001', Buffer.from(body))).not.toBe(signature);
    expect(computeSignature(`${secret}x`, timestamp, Buffer.from(body))).not.toBe(signature);
  });

  it('compares signatures exactly, including when the lengths differ', () => {
    const { signature } = SHARED_TEST_VECTOR;
    expect(signaturesMatch(signature, signature)).toBe(true);
    expect(signaturesMatch(signature, `${signature}0`)).toBe(false);
    expect(signaturesMatch(signature, signature.slice(0, -1))).toBe(false);
    expect(signaturesMatch(signature, '')).toBe(false);
  });

  it('accepts a timestamp within the skew window and refuses one outside it', () => {
    const now = 1_700_000_000;
    expect(isFreshTimestamp(String(now), now)).toBe(true);
    expect(isFreshTimestamp(String(now - MAX_CLOCK_SKEW_SECONDS), now)).toBe(true);
    expect(isFreshTimestamp(String(now + MAX_CLOCK_SKEW_SECONDS), now)).toBe(true);
    expect(isFreshTimestamp(String(now - MAX_CLOCK_SKEW_SECONDS - 1), now)).toBe(false);
    expect(isFreshTimestamp(String(now + MAX_CLOCK_SKEW_SECONDS + 1), now)).toBe(false);
  });

  it('refuses a timestamp that is not a plain unix-seconds integer', () => {
    expect(isFreshTimestamp('', 1_700_000_000)).toBe(false);
    expect(isFreshTimestamp('abc', 1_700_000_000)).toBe(false);
    expect(isFreshTimestamp('1.7e9', 1_700_000_000)).toBe(false);
    expect(isFreshTimestamp('-1700000000', 1_700_000_000)).toBe(false);
  });
});
