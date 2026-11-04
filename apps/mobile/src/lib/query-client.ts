import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      // Driven by AppState via focusManager (see QueryProvider): stale data
      // refetches when the app returns to the foreground.
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: 0,
    },
  },
});
