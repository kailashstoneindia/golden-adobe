/**
 * API route paths (relative to `Env.apiBaseUrl`).
 * Never hardcode these strings in services or components.
 */
export const API_ENDPOINTS = {
  health: '/health',
  auth: {
    sendOtp: '/auth/otp/send',
    verifyOtp: '/auth/otp/verify',
    register: '/auth/register',
    refresh: '/auth/refresh',
    logout: '/auth/logout',
    me: '/auth/me',
  },
  vendors: {
    onboard: '/vendors/onboard',
    onboardingProgress: '/vendors/onboarding-progress',
  },
} as const;

/** Endpoints that must not trigger a token-refresh retry on 401. */
export const AUTH_PUBLIC_ENDPOINTS = [
  API_ENDPOINTS.auth.sendOtp,
  API_ENDPOINTS.auth.verifyOtp,
  API_ENDPOINTS.auth.register,
  API_ENDPOINTS.auth.refresh,
] as const;
