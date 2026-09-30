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
    meCategories: '/vendors/me/categories',
  },
  search: {
    products: '/search',
  },
  vendorListings: {
    list: '/vendor/listings',
    stock: (vendorListingId: string) => `/vendor/listings/${vendorListingId}/stock`,
    status: (vendorListingId: string) => `/vendor/listings/${vendorListingId}/status`,
    bulkStock: '/vendor/listings/stock/bulk',
  },
  vendorCatalogImport: {
    exportCount: '/vendor/catalog-import/export/count',
    export: '/vendor/catalog-import/export',
    upload: '/vendor/catalog-import',
    pendingConfirmations: '/vendor/catalog-import/pending-confirmations',
    confirm: (vendorListingId: string) =>
      `/vendor/catalog-import/pending-confirmations/${vendorListingId}/confirm`,
    choose: (vendorListingId: string) =>
      `/vendor/catalog-import/pending-confirmations/${vendorListingId}/choose`,
    reject: (vendorListingId: string) =>
      `/vendor/catalog-import/pending-confirmations/${vendorListingId}/reject`,
  },
} as const;

/** Endpoints that must not trigger a token-refresh retry on 401. */
export const AUTH_PUBLIC_ENDPOINTS = [
  API_ENDPOINTS.auth.sendOtp,
  API_ENDPOINTS.auth.verifyOtp,
  API_ENDPOINTS.auth.register,
  API_ENDPOINTS.auth.refresh,
  API_ENDPOINTS.search.products,
] as const;
