import { useQuery } from '@tanstack/react-query';

import { QUERY_KEYS } from '../../constants';
import { authService } from '../../services';
import { selectIsAuthenticated, useAuthStore } from '../../stores/auth.store';

export function useMe() {
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
  });
}
