import { useMutation } from '@tanstack/react-query';
import type { VerifyOtpDto } from '@golden-abode/types';

import { tokenManager } from '../../api';
import { authService } from '../../services';
import { useAuthStore } from '../../stores/auth.store';

export function useVerifyOtp() {
  const setSession = useAuthStore((state) => state.setSession);

  return useMutation({
    mutationFn: (dto: VerifyOtpDto) => authService.verifyOtp(dto),
    onSuccess: async (data) => {
      if (!data.isNewUser) {
        await tokenManager.setRefreshToken(data.refreshToken);
        setSession(data.accessToken, data.user);
      }
    },
  });
}
