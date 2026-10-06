import { describe, expect, it } from 'vitest';

import { CallbackError, computeSignature, sendResult } from '../src/callback';
import { loadConfig } from '../src/config';

// Identical to SHARED_TEST_VECTOR in the backend's media-callback-signature.spec.ts.
// If either side's signing changes, one of the two suites fails.
const SHARED_TEST_VECTOR = {
  secret: 'test-secret-test-secret-test-secret-1234',
  timestamp: '1700000000',
  body: '{"status":"ready"}',
  signature: 'sha256=3d5c053dfeccf4a9124d984b4086aef3cfb50fa298254c03218f9016991f3ef7',
};

const config = loadConfig({
  API_CALLBACK_BASE_URL: 'https://api.example.com/',
  MEDIA_CALLBACK_SECRET: SHARED_TEST_VECTOR.secret,
});
const MEDIA = '22222222-2222-4222-8222-222222222222';

describe('computeSignature', () => {
  it('matches the shared test vector the backend verifies against', () => {
    const { secret, timestamp, body, signature } = SHARED_TEST_VECTOR;
    expect(computeSignature(secret, timestamp, body)).toBe(signature);
  });
});

describe('sendResult', () => {
  function recordingFetch(status: number) {
    const calls: { url: string; init: RequestInit }[] = [];
    const impl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(null, { status });
    }) as unknown as typeof fetch;
    return { calls, impl };
  }

  it('posts a signed body to the media callback route', async () => {
    const { calls, impl } = recordingFetch(200);

    await sendResult(config, MEDIA, { status: 'ready' }, impl, () => 1_700_000_000_000);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      `https://api.example.com/api/internal/media/${MEDIA}/processing-result`,
    );
    const headers = calls[0].init.headers as Record<string, string>;
    expect(calls[0].init.body).toBe('{"status":"ready"}');
    expect(headers['X-Media-Timestamp']).toBe('1700000000');
    expect(headers['X-Media-Signature']).toBe(SHARED_TEST_VECTOR.signature);
  });

  it('sends the reason when an image failed', async () => {
    const { calls, impl } = recordingFetch(200);

    await sendResult(config, MEDIA, { status: 'failed', reason: 'corrupt' }, impl);

    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      status: 'failed',
      reason: 'corrupt',
    });
  });

  it.each([401, 404, 500])('throws on a %i, so S3 retries the invocation', async (status) => {
    const { impl } = recordingFetch(status);

    await expect(sendResult(config, MEDIA, { status: 'ready' }, impl)).rejects.toMatchObject({
      name: 'CallbackError',
      status,
    });
  });

  it('throws when the API cannot be reached', async () => {
    const down = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;

    await expect(sendResult(config, MEDIA, { status: 'ready' }, down)).rejects.toBeInstanceOf(
      CallbackError,
    );
  });
});
