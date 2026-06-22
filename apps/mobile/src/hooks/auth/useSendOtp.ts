import { useMutation } from '@tanstack/react-query';
import type { SendOtpDto } from '@golden-abode/types';

import { authService } from '../../services';

export function useSendOtp() {
  return useMutation({
    mutationFn: (dto: SendOtpDto) => authService.sendOtp(dto),
  });
}
