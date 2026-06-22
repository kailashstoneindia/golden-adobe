import type {
  AuthResponseDto,
  AuthTokensDto,
  LogoutDto,
  RegisterDto,
  SendOtpDto,
  UserDto,
  VerifyOtpDto,
  VerifyOtpResponseDto,
} from '@golden-abode/types';

import { apiClient } from '../api/client';
import { tokenManager } from '../api/token-manager';
import { API_ENDPOINTS } from '../constants';
import { useAuthStore } from '../stores/auth.store';

/** Dev-only OTP hint returned by the backend in development mode. */
export interface SendOtpResult {
  message: string;
  devOtp?: string;
}

export interface RegisterResult extends AuthResponseDto {}

export interface LogoutResult {
  message: string;
}

/**
 * Auth API layer. All HTTP calls go through `apiClient` — never import axios here.
 */
export const authService = {
  sendOtp(dto: SendOtpDto): Promise<SendOtpResult> {
    return apiClient.post<SendOtpResult>(API_ENDPOINTS.auth.sendOtp, dto);
  },

  verifyOtp(dto: VerifyOtpDto): Promise<VerifyOtpResponseDto> {
    return apiClient.post<VerifyOtpResponseDto>(API_ENDPOINTS.auth.verifyOtp, dto);
  },

  register(dto: RegisterDto): Promise<RegisterResult> {
    return apiClient.post<RegisterResult>(API_ENDPOINTS.auth.register, dto);
  },

  refresh(dto: { refreshToken: string }): Promise<AuthTokensDto> {
    return apiClient.post<AuthTokensDto>(API_ENDPOINTS.auth.refresh, dto, {
      _skipAuthRefresh: true,
    });
  },

  getMe(): Promise<UserDto> {
    return apiClient.get<UserDto>(API_ENDPOINTS.auth.me);
  },

  async logout(): Promise<LogoutResult | null> {
    const refreshToken = await tokenManager.getRefreshToken();

    if (!refreshToken) {
      return null;
    }

    const body: LogoutDto = { refreshToken };

    try {
      return await apiClient.post<LogoutResult>(API_ENDPOINTS.auth.logout, body);
    } finally {
      await tokenManager.clearRefreshToken();
      useAuthStore.getState().clearSession();
    }
  },

  /**
   * Restores a session from the stored refresh token on cold start.
   * Silently clears local credentials when refresh fails.
   */
  async hydrateSession(): Promise<void> {
    const refreshToken = await tokenManager.getRefreshToken();
    if (!refreshToken) {
      return;
    }

    try {
      const tokens = await authService.refresh({ refreshToken });
      await tokenManager.setRefreshToken(tokens.refreshToken);
      useAuthStore.getState().setAccessToken(tokens.accessToken);

      const user = await authService.getMe();
      useAuthStore.getState().setSession(tokens.accessToken, user);
    } catch {
      await tokenManager.clearRefreshToken();
      useAuthStore.getState().clearSession();
    }
  },
};
