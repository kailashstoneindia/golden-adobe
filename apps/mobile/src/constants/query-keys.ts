/**
 * TanStack Query key factory.
 * Keeps cache keys consistent and makes targeted invalidation trivial.
 */
export const QUERY_KEYS = {
  auth: {
    all: ['auth'] as const,
    me: () => [...QUERY_KEYS.auth.all, 'me'] as const,
  },
  vendor: {
    all: ['vendor'] as const,
    profile: () => [...QUERY_KEYS.vendor.all, 'profile'] as const,
    categories: () => [...QUERY_KEYS.vendor.all, 'categories'] as const,
  },
  search: {
    all: ['search'] as const,
    products: (paramsKey: string) => [...QUERY_KEYS.search.all, 'products', paramsKey] as const,
  },
  vendorListings: {
    all: ['vendorListings'] as const,
    list: (paramsKey: string) => [...QUERY_KEYS.vendorListings.all, 'list', paramsKey] as const,
  },
  vendorCatalogImport: {
    all: ['vendorCatalogImport'] as const,
    exportCount: (paramsKey: string) =>
      [...QUERY_KEYS.vendorCatalogImport.all, 'exportCount', paramsKey] as const,
    pendingConfirmations: () =>
      [...QUERY_KEYS.vendorCatalogImport.all, 'pendingConfirmations'] as const,
  },
} as const;
