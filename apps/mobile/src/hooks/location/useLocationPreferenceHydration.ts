import { useEffect } from 'react';

import { useLocationPreferenceStore } from '../../stores/location-preference.store';

/**
 * Restores the customer's saved search location on cold start.
 * Call once near the app root alongside auth hydration.
 */
export function useLocationPreferenceHydration() {
  const isHydrated = useLocationPreferenceStore((store) => store.isHydrated);
  const hydratePreference = useLocationPreferenceStore((store) => store.hydratePreference);

  useEffect(() => {
    if (isHydrated) {
      return;
    }
    void hydratePreference();
  }, [hydratePreference, isHydrated]);

  return { isHydrated };
}
