import { useMutation } from '@tanstack/react-query';
import type { VendorOnboardDto } from '@golden-abode/types';
import { router } from 'expo-router';

import { ApiError } from '../../api';
import { ERROR_MESSAGES, QUERY_KEYS, ROUTES } from '../../constants';
import { queryClient } from '../../lib/query-client';
import { authService, vendorService } from '../../services';
import { useAuthStore } from '../../stores/auth.store';

export function useVendorOnboard() {
  const setUser = useAuthStore((authStore) => authStore.setUser);

  return useMutation({
    mutationFn: (dto: VendorOnboardDto) => vendorService.onboard(dto),
    onSuccess: async () => {
      const user = await authService.getMe();
      setUser(user);
      queryClient.setQueryData(QUERY_KEYS.auth.me(), user);
      router.replace(ROUTES.pendingApproval);
    },
  });
}

export function getVendorOnboardErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return ERROR_MESSAGES.vendorOnboardFailed;
}
