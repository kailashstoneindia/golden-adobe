import type {
  AuthResponseDto,
  LogoutDto,
  SendOtpDto,
  UserDto,
  VerifyOtpDto,
  VerifyOtpResponseDto,
} from '@golden-abode/types';

import { API_ENDPOINTS } from '@/constants/apiEndpoints';
import { getRequest, postRequest } from '@/services/api/apiClient';

export type SendOtpResult = {
  message: string;
  devOtp?: string;
};

export const authService = {
  sendOtp(dto: SendOtpDto): Promise<SendOtpResult> {
    return postRequest<SendOtpResult, SendOtpDto>(API_ENDPOINTS.auth.sendOtp, dto);
  },

  verifyOtp(dto: VerifyOtpDto): Promise<VerifyOtpResponseDto> {
    return postRequest<VerifyOtpResponseDto, VerifyOtpDto>(API_ENDPOINTS.auth.verifyOtp, dto);
  },

  getMe(): Promise<UserDto> {
    return getRequest<UserDto>(API_ENDPOINTS.auth.me);
  },

  logout(dto: LogoutDto): Promise<{ message: string }> {
    return postRequest<{ message: string }, LogoutDto>(API_ENDPOINTS.auth.logout, dto);
  },
};

export function isAuthResponse(
  response: VerifyOtpResponseDto,
): response is AuthResponseDto {
  return response.isNewUser === false;
}
