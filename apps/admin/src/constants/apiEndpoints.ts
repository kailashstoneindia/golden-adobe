export const API_ENDPOINTS = {
  auth: {
    adminRegister: '/auth/admin/register',
    adminLogin: '/auth/admin/login',
    me: '/auth/me',
    logout: '/auth/logout',
    refresh: '/auth/refresh',
  },
  admin: {
    stats: '/admin/stats',
    users: '/admin/users',
    userById: (userId: string) => `/admin/users/${userId}`,
    approveUser: (userId: string) => `/admin/users/${userId}/approve`,
    rejectUser: (userId: string) => `/admin/users/${userId}/reject`,
    vendors: '/admin/vendors',
    vendorById: (vendorId: string) => `/admin/vendors/${vendorId}`,
    vendorCity: (vendorId: string) => `/admin/vendors/${vendorId}/city`,
    vendorCategories: (vendorId: string) => `/admin/vendors/${vendorId}/categories`,
    cities: '/admin/cities',
    orders: '/admin/orders',
    orderById: (orderId: string) => `/admin/orders/${orderId}`,
    orderRefund: (orderId: string) => `/admin/orders/${orderId}/refund`,
    orderCancel: (orderId: string) => `/admin/orders/${orderId}/cancel`,
    orderPaymentEvents: (orderId: string) => `/admin/orders/${orderId}/payment-events`,
    overrideVendorGroupStatus: (groupId: string) =>
      `/admin/orders/vendor-group/${groupId}/override-status`,
    artisans: '/admin/artisans',
    artisanById: (artisanId: string) => `/admin/artisans/${artisanId}`,
    artisansPendingVerification: '/admin/artisans/pending-verification',
    verifyArtisan: (artisanId: string) => `/admin/artisans/${artisanId}/verify`,
    rejectArtisanVerification: (artisanId: string) =>
      `/admin/artisans/${artisanId}/reject-verification`,
    artisanHireRequestsPending: '/admin/artisans/hire-requests/pending',
    artisanHireRequestsAll: '/admin/artisans/hire-requests',
    reviewArtisanHireRequest: (requestId: string) =>
      `/admin/artisans/hire-requests/${requestId}/review`,
    // Not under /admin/ — shared across customer/artisan/admin roles on
    // ArtisansController, not AdminArtisansController.
    cancelArtisanHireRequest: (requestId: string) => `/artisans/hire-requests/${requestId}/cancel`,
  },
  catalog: {
    categories: '/admin/catalog/categories',
    categoryAttributes: (categoryId: string) =>
      `/admin/catalog/categories/${categoryId}/attributes`,
    products: '/admin/catalog/products',
    productById: (productId: string) => `/admin/catalog/products/${productId}`,
    publishProduct: (productId: string) => `/admin/catalog/products/${productId}/publish`,
    unpublishProduct: (productId: string) => `/admin/catalog/products/${productId}/unpublish`,
    bulkPublish: '/admin/catalog/products/bulk-publish',
  },
  // Product images (decision 0033).
  media: {
    list: (productId: string) => `/admin/catalog/products/${productId}/media`,
    uploads: (productId: string) => `/admin/catalog/products/${productId}/media/uploads`,
    order: (productId: string) => `/admin/catalog/products/${productId}/media/order`,
    byId: (productId: string, mediaId: string) =>
      `/admin/catalog/products/${productId}/media/${mediaId}`,
    reprocess: (productId: string, mediaId: string) =>
      `/admin/catalog/products/${productId}/media/${mediaId}/reprocess`,
  },
  catalogImport: {
    template: (categoryId: string) => `/admin/catalog-import/template/${categoryId}`,
    upload: (categoryId: string) => `/admin/catalog-import/${categoryId}`,
  },
  catalogReview: {
    list: '/admin/catalog-review-queue',
    link: (importRowId: string) => `/admin/catalog-review-queue/${importRowId}/link`,
    reject: (importRowId: string) => `/admin/catalog-review-queue/${importRowId}/reject`,
  },
} as const;
