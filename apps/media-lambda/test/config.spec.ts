import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config';

const valid = {
  API_CALLBACK_BASE_URL: 'https://api.example.com',
  MEDIA_CALLBACK_SECRET: 'a'.repeat(40),
};

describe('loadConfig', () => {
  it('reads the required values and applies defaults', () => {
    expect(loadConfig(valid)).toEqual({
      apiCallbackBaseUrl: 'https://api.example.com',
      callbackSecret: 'a'.repeat(40),
      maxSourceBytes: 10 * 1024 * 1024,
      maxInputPixels: 40_000_000,
      callbackTimeoutMs: 5000,
    });
  });

  it('trims a trailing slash from the API URL', () => {
    expect(
      loadConfig({ ...valid, API_CALLBACK_BASE_URL: 'https://api.example.com//' })
        .apiCallbackBaseUrl,
    ).toBe('https://api.example.com');
  });

  it('fails at start-up, naming every problem, when required values are missing', () => {
    expect(() => loadConfig({})).toThrow(/API_CALLBACK_BASE_URL.*MEDIA_CALLBACK_SECRET/);
  });

  it('refuses a short secret', () => {
    expect(() => loadConfig({ ...valid, MEDIA_CALLBACK_SECRET: 'short' })).toThrow(/at least 32/);
  });

  it('rejects limits that are not positive integers', () => {
    expect(() => loadConfig({ ...valid, MAX_SOURCE_BYTES: 'lots' })).toThrow(/MAX_SOURCE_BYTES/);
    expect(() => loadConfig({ ...valid, VARIANTS_MAX_INPUT_PIXELS: '0' })).toThrow(
      /VARIANTS_MAX_INPUT_PIXELS/,
    );
  });
});
