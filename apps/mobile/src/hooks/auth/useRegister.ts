import { useMutation } from '@tanstack/react-query';
import type { RegisterDto } from '@golden-abode/types';

import { tokenManager } from '../../api';
import { QUERY_KEYS } from '../../constants';
import { queryClient } from '../../lib/query-client';
import { authService } from '../../services';
import { useAuthStore } from '../../stores/auth.store';

export function useRegister() {
  const setSession = useAuthStore((state) => state.setSession);

  return useMutation({
    mutationFn: (dto: RegisterDto) => authService.register(dto),
    onSuccess: async (data) => {
      await tokenManager.setRefreshToken(data.refreshToken);
      setSession(data.accessToken, data.user);
      queryClient.setQueryData(QUERY_KEYS.auth.me(), data.user);
    },
  });
}
