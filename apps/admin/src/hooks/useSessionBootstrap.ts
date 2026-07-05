import { useEffect } from 'react';
import { Role } from '@golden-abode/types';

import { authService } from '@/services';
import { tokenStorage } from '@/services/storage/tokenStorage';
import { useAuthStore } from '@/store';

export function useSessionBootstrap(): boolean {
  const adminUser = useAuthStore((authStore) => authStore.user);
  const isHydrated = useAuthStore((authStore) => authStore.isHydrated);
  const setUser = useAuthStore((authStore) => authStore.setUser);
  const clearSession = useAuthStore((authStore) => authStore.clearSession);
  const markHydrated = useAuthStore((authStore) => authStore.hydrate);

  useEffect(() => {
    if (isHydrated) {
      return;
    }

    const bootstrapSession = async () => {
      const accessToken = tokenStorage.getAccessToken();
      if (!accessToken) {
        markHydrated();
        return;
      }

      const existingUser = useAuthStore.getState().user;
      if (existingUser) {
        markHydrated();
        return;
      }

      try {
        const user = await authService.getMe();
        if (user.role !== Role.ADMIN) {
          clearSession();
          return;
        }
        setUser(user);
      } catch {
        clearSession();
      } finally {
        markHydrated();
      }
    };

    void bootstrapSession();
  }, [clearSession, isHydrated, markHydrated, setUser]);

  return isHydrated && Boolean(adminUser);
}
