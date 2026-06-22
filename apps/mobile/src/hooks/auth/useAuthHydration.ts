import { useEffect } from 'react';

import { authService } from '../../services';
import { useAuthStore } from '../../stores/auth.store';

/**
 * Restores the session from SecureStore on cold start.
 * Call once near the app root (e.g. root layout) after fonts are ready.
 */
export function useAuthHydration() {
  const isHydrated = useAuthStore((state) => state.isHydrated);
  const setHydrated = useAuthStore((state) => state.setHydrated);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      try {
        await authService.hydrateSession();
      } finally {
        if (!cancelled) {
          setHydrated(true);
        }
      }
    }

    if (!isHydrated) {
      void hydrate();
    }

    return () => {
      cancelled = true;
    };
  }, [isHydrated, setHydrated]);

  return { isHydrated };
}
