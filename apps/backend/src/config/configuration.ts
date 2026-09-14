import { resolveDatabaseConfig, resolveRedisConfig } from './connection-url';

export default () => ({
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  database: resolveDatabaseConfig(),
  redis: resolveRedisConfig(),
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    onboardingSecret: process.env.JWT_ONBOARDING_SECRET,
    onboardingExpiresIn: process.env.JWT_ONBOARDING_EXPIRES_IN || '15m',
    refreshTokenTtlDays: parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '30', 10),
  },
  msg91: {
    authKey: process.env.MSG91_AUTH_KEY,
    templateId: process.env.MSG91_TEMPLATE_ID,
    senderId: process.env.MSG91_SENDER_ID || 'GOLDEN',
    useSms: process.env.USE_MSG91_SMS === 'true',
  },
  admin: {
    registrationSecret: process.env.ADMIN_REGISTRATION_SECRET || '',
  },
  throttle: {
    otpSendLimit: parseInt(process.env.THROTTLE_OTP_SEND_LIMIT || '3', 10),
    otpSendTtl: parseInt(process.env.THROTTLE_OTP_SEND_TTL || '3600', 10),
    otpVerifyLimit: parseInt(process.env.THROTTLE_OTP_VERIFY_LIMIT || '5', 10),
    otpVerifyTtl: parseInt(process.env.THROTTLE_OTP_VERIFY_TTL || '600', 10),
  },
  // Phase 6 search runtime (decision 0021). Host and keys are configuration
  // ONLY — moving from the local Docker container to Railway must be an env
  // var change, never a code edit.
  search: {
    // 'meilisearch' | 'postgres' — the kill switch (search-system-design.md
    // section 9). Falling back to Postgres is a supported permanent mode, not
    // a degraded one: it is also admin's primary search path (0019).
    engine: process.env.SEARCH_ENGINE || 'meilisearch',
    // 'all' | 'api' | 'worker' (search-system-design.md section 9).
    //
    //   all    — HTTP endpoints AND the outbox drain in one process (default;
    //            what a single Railway service or local dev runs)
    //   api    — HTTP only, no drain scheduled
    //   worker — the drain only
    //
    // Splitting the worker onto its own Railway service is then an env var
    // rather than a refactor. It also makes the drain externally controllable,
    // which matters for tests and for one-off maintenance: with WORKER_MODE=api
    // nothing competes for search_outbox_try_lock(), so a manual drain is
    // deterministic instead of racing the scheduler.
    workerMode: process.env.WORKER_MODE || 'all',
    meili: {
      host: process.env.MEILI_HOST || 'http://127.0.0.1:7700',
      // Full-access key. Used by the backend for indexing and by the worker.
      // Never exposed to a client bundle.
      masterKey: process.env.MEILI_MASTER_KEY || 'local_dev_master_key_change_me',
      // Search-only key. This is the one that may eventually be handed to a
      // client for direct autocomplete calls (0019).
      searchKey: process.env.MEILI_SEARCH_KEY || '',
      productsIndex: process.env.MEILI_PRODUCTS_INDEX || 'products',
    },
  },
});
