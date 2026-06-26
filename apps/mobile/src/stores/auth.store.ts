import type { UserDto } from '@golden-abode/types';
import { create } from 'zustand';

interface AuthState {
  accessToken: string | null;
  user: UserDto | null;
  isHydrated: boolean;
  setAccessToken: (accessToken: string) => void;
  setUser: (user: UserDto) => void;
  setSession: (accessToken: string, user: UserDto) => void;
  clearSession: () => void;
  setHydrated: (hydrated: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  isHydrated: false,

  setAccessToken: (accessToken) => set({ accessToken }),

  setUser: (user) => set({ user }),

  setSession: (accessToken, user) => set({ accessToken, user }),

  clearSession: () => set({ accessToken: null, user: null }),

  setHydrated: (isHydrated) => set({ isHydrated }),
}));

/** Selector — true when an access token is present. */
export const selectIsAuthenticated = (state: AuthState): boolean => state.accessToken !== null;
