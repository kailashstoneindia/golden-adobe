import type { UserDto } from '@golden-abode/types';
import { create } from 'zustand';

import { tokenStorage } from '@/services/storage/tokenStorage';

export type AuthStoreState = {
  user: UserDto | null;
  isHydrated: boolean;
  setSession: (user: UserDto, accessToken: string, refreshToken: string) => void;
  setUser: (user: UserDto) => void;
  clearSession: () => void;
  hydrate: () => void;
};

export const selectAdminUser = (authStore: AuthStoreState): UserDto | null => authStore.user;

export const selectIsHydrated = (authStore: AuthStoreState): boolean => authStore.isHydrated;

export const selectSetSession = (
  authStore: AuthStoreState,
): AuthStoreState['setSession'] => authStore.setSession;

export const selectSetUser = (authStore: AuthStoreState): AuthStoreState['setUser'] => authStore.setUser;

export const selectClearSession = (
  authStore: AuthStoreState,
): AuthStoreState['clearSession'] => authStore.clearSession;

export const selectHydrate = (authStore: AuthStoreState): AuthStoreState['hydrate'] => authStore.hydrate;

export const useAuthStore = create<AuthStoreState>((set) => ({
  user: null,
  isHydrated: false,
  setSession: (user, accessToken, refreshToken) => {
    tokenStorage.setTokens(accessToken, refreshToken);
    set({ user });
  },
  setUser: (user) => set({ user }),
  clearSession: () => {
    tokenStorage.clearTokens();
    set({ user: null });
  },
  hydrate: () => set({ isHydrated: true }),
}));
