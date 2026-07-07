import { useEffect } from 'react';
import { Role } from '@golden-abode/types';

import { authService } from '@/services';
import { tokenStorage } from '@/services/storage/tokenStorage';
import {
  selectAdminUser,
  selectClearSession,
  selectHydrate,
  selectIsHydrated,
  selectSetUser,
  useAuthStore,
} from '@/store';

export function useSessionBootstrap(): boolean {
  const adminUser = useAuthStore(selectAdminUser);
  const isHydrated = useAuthStore(selectIsHydrated);
  const setUser = useAuthStore(selectSetUser);
  const clearSession = useAuthStore(selectClearSession);
  const markHydrated = useAuthStore(selectHydrate);

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
