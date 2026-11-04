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
    me: '/vendors/me',
    meCategories: '/vendors/me/categories',
    orderGroups: '/vendors/order-groups',
    orderGroupById: (groupId: string) => `/vendors/order-groups/${groupId}`,
    orderGroupStatus: (groupId: string) => `/vendors/order-groups/${groupId}/status`,
  },
  cart: {
    root: '/cart',
    items: '/cart/items',
    itemById: (itemId: string) => `/cart/items/${itemId}`,
  },
  artisans: {
    search: '/artisans',
    meProfile: '/artisans/me/profile',
    meAccountDetails: '/artisans/me/account-details',
    meDocumentUploadUrl: '/artisans/me/documents/upload-url',
    meDocumentConfirm: '/artisans/me/documents/confirm',
    meTeam: '/artisans/me/team',
    meTeamMember: (memberId: string) => `/artisans/me/team/${memberId}`,
    meHireRequests: '/artisans/me/hire-requests',
    meHireRequestEstimates: (requestId: string) =>
      `/artisans/me/hire-requests/${requestId}/estimates`,
    meHireRequestAccept: (requestId: string) => `/artisans/me/hire-requests/${requestId}/accept`,
    meHireRequestDecline: (requestId: string) =>
      `/artisans/me/hire-requests/${requestId}/decline`,
    meHireRequestStart: (requestId: string) => `/artisans/me/hire-requests/${requestId}/start`,
    meHireRequestComplete: (requestId: string) =>
      `/artisans/me/hire-requests/${requestId}/complete`,
    hireRequests: '/artisans/hire-requests',
    myHireRequests: '/artisans/hire-requests/mine',
    hireRequestById: (requestId: string) => `/artisans/hire-requests/${requestId}`,
    hireRequestCancel: (requestId: string) => `/artisans/hire-requests/${requestId}/cancel`,
    hireRequestEstimates: (requestId: string) => `/artisans/hire-requests/${requestId}/estimates`,
    hireRequestOrders: (requestId: string) => `/artisans/hire-requests/${requestId}/orders`,
    publicProfile: (artisanId: string) => `/artisans/${artisanId}/public`,
  },
  checkout: '/checkout',
  orders: {
    list: '/orders',
    byId: (orderId: string) => `/orders/${orderId}`,
    cancel: (orderId: string) => `/orders/${orderId}/cancel`,
  },
  customers: {
    me: '/customers/me',
    addresses: '/customers/me/addresses',
    addressById: (addressId: string) => `/customers/me/addresses/${addressId}`,
  },
  search: {
    products: '/search',
    listings: (masterProductId: string) => `/search/${masterProductId}/listings`,
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
