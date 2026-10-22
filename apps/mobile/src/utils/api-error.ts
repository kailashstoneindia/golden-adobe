import { ApiError } from '../api';
import { ERROR_MESSAGES } from '../constants';

export function getApiErrorMessage(
  error: unknown,
  fallback: string = ERROR_MESSAGES.generic,
): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}
