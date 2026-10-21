export type LambdaConfig = {
  // Base URL of the API, no trailing slash. The callback goes to
  // `${apiCallbackBaseUrl}/api/internal/media/{mediaId}/processing-result`.
  apiCallbackBaseUrl: string;
  callbackSecret: string;
  // Originals larger than this are failed without being read.
  maxSourceBytes: number;
  // Decompression-bomb guard: images with more pixels than this are refused.
  maxInputPixels: number;
  callbackTimeoutMs: number;
};

type Env = Record<string, string | undefined>;

export const MIN_SECRET_LENGTH = 32;

function positiveInt(env: Env, name: string, fallback: number): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer, got "${raw}"`);
  }
  return parsed;
}

// Throws on anything missing, so a misconfigured function fails at cold start
// (a visible init error) instead of failing every image one at a time.
export function loadConfig(env: Env = process.env): LambdaConfig {
  const apiCallbackBaseUrl = (env.API_CALLBACK_BASE_URL ?? '').trim().replace(/\/+$/, '');
  const callbackSecret = (env.MEDIA_CALLBACK_SECRET ?? '').trim();

  const problems: string[] = [];
  if (!apiCallbackBaseUrl) problems.push('API_CALLBACK_BASE_URL is required');
  if (callbackSecret.length < MIN_SECRET_LENGTH) {
    problems.push(`MEDIA_CALLBACK_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
  }
  if (problems.length > 0) throw new Error(`Invalid configuration: ${problems.join('; ')}`);

  return {
    apiCallbackBaseUrl,
    callbackSecret,
    maxSourceBytes: positiveInt(env, 'MAX_SOURCE_BYTES', 10 * 1024 * 1024),
    maxInputPixels: positiveInt(env, 'VARIANTS_MAX_INPUT_PIXELS', 40_000_000),
    callbackTimeoutMs: positiveInt(env, 'CALLBACK_TIMEOUT_MS', 5000),
  };
}
