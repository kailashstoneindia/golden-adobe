import { Role } from './role.enum';
import { UserDto } from './user.types';

// ─── Request DTOs ──────────────────────────────────────────────────────────────

export interface SendOtpDto {
  phone: string;
}

export interface VerifyOtpDto {
  phone: string;
  otp: string;
}

export interface RegisterDto {
  onboardingToken: string;
  name: string;
  /** Must be CUSTOMER | VENDOR | ARTISAN — ADMIN cannot be self-selected */
  role: Exclude<Role, Role.ADMIN>;
}

export interface RefreshTokenDto {
  refreshToken: string;
}

export interface LogoutDto {
  refreshToken: string;
}

// ─── Response DTOs ─────────────────────────────────────────────────────────────

/** Returned when an existing user verifies OTP (login complete) */
export interface AuthTokensDto {
  accessToken: string;
  refreshToken: string;
}

/** Full auth response — tokens + user profile */
export interface AuthResponseDto {
  isNewUser: false;
  accessToken: string;
  refreshToken: string;
  user: UserDto;
}

/** Returned when a new user verifies OTP — must complete registration */
export interface OnboardingResponseDto {
  isNewUser: true;
  onboardingToken: string;
}

/** Union of both possible verify-OTP responses */
export type VerifyOtpResponseDto = AuthResponseDto | OnboardingResponseDto;

/** Standard API success envelope */
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  message?: string;
}

/** Standard API error envelope */
export interface ApiErrorResponse {
  success: false;
  statusCode: number;
  error: string;
  message: string;
  timestamp: string;
  path: string;
}
