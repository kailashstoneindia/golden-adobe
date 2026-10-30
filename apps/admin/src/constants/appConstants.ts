export const APP_CONSTANTS = {
  appName: 'Kailash Stones Admin',
  defaultPageSize: 20,
  staleTimeMs: 30_000,
  statsStaleTimeMs: 60_000,
  loginRedirectDelayMs: 300,
  phoneCountryCode: '+91',
  minPasswordLength: 8,
  minSecretKeyLength: 8,
  otpLength: 6,
  demoAdminPhone: '+919999999999',
  /**
   * Vite build-time API origin.
   * Local + Docker/nginx keep relative "/api".
   * Production (CloudFront) also keeps the relative "/api"; set VITE_API_BASE_URL only to override.
   */
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL?.trim() || '/api',
} as const;
