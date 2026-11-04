import { useQuery } from '@tanstack/react-query';

import { QUERY_KEYS } from '../../constants';
import { authService } from '../../services';
import { selectIsAuthenticated, useAuthStore } from '../../stores/auth.store';

/** `refetchIntervalMs` polls while set, e.g. on the pending-approval screen. */
export function useMe(refetchIntervalMs?: number) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const setUser = useAuthStore((state) => state.setUser);

  return useQuery({
    queryKey: QUERY_KEYS.auth.me(),
    queryFn: async () => {
      const user = await authService.getMe();
      setUser(user);
      return user;
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60_000,
    refetchInterval: refetchIntervalMs ?? false,
  });
}
