import { useAuthStore, selectIsAuthenticated } from '../../stores/auth.store';

/** Convenience hook for reading auth state in screens. */
export function useAuth() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const isHydrated = useAuthStore((state) => state.isHydrated);

  return {
    accessToken,
    user,
    isAuthenticated,
    isHydrated,
  };
}
