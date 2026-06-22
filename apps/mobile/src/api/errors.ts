import type { ApiErrorResponse } from '@golden-abode/types';
import axios from 'axios';

/**
 * Typed HTTP error matching the backend's global exception filter envelope.
 * Safe to surface `message` directly in UI.
 */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly error: string;
  readonly path: string;
  readonly timestamp: string;

  constructor(payload: ApiErrorResponse) {
    super(payload.message);
    this.name = 'ApiError';
    this.statusCode = payload.statusCode;
    this.error = payload.error;
    this.path = payload.path;
    this.timestamp = payload.timestamp;
  }

  static fromUnknown(error: unknown): ApiError {
    if (axios.isAxiosError(error)) {
      const body = error.response?.data;

      if (body && typeof body === 'object' && 'success' in body && body.success === false) {
        return new ApiError(body as ApiErrorResponse);
      }

      return new ApiError({
        success: false,
        statusCode: error.response?.status ?? 0,
        error: error.response?.statusText ?? 'NetworkError',
        message: error.message || 'Network request failed',
        timestamp: new Date().toISOString(),
        path: error.config?.url ?? '',
      });
    }

    return new ApiError({
      success: false,
      statusCode: 0,
      error: 'UnknownError',
      message: error instanceof Error ? error.message : 'An unexpected error occurred',
      timestamp: new Date().toISOString(),
      path: '',
    });
  }
}
