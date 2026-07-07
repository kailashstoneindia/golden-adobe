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
  },
} as const;
