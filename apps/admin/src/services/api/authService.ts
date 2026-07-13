import type {
  AdminLoginDto,
  AdminRegisterDto,
  AuthResponseDto,
  LogoutDto,
  UserDto,
} from '@golden-abode/types';

import { API_ENDPOINTS } from '@/constants/apiEndpoints';
import { getRequest, postRequest } from '@/services/api/apiClient';

export const authService = {
  registerAdmin(dto: AdminRegisterDto): Promise<AuthResponseDto> {
    return postRequest<AuthResponseDto, AdminRegisterDto>(API_ENDPOINTS.auth.adminRegister, dto);
  },

  loginAdmin(dto: AdminLoginDto): Promise<AuthResponseDto> {
    return postRequest<AuthResponseDto, AdminLoginDto>(API_ENDPOINTS.auth.adminLogin, dto);
  },

  getMe(): Promise<UserDto> {
    return getRequest<UserDto>(API_ENDPOINTS.auth.me);
  },

  logout(dto: LogoutDto): Promise<{ message: string }> {
    return postRequest<{ message: string }, LogoutDto>(API_ENDPOINTS.auth.logout, dto);
  },
};
