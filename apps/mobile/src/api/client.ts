import type { ApiSuccessResponse } from '@golden-abode/types';
import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';

import { API_ENDPOINTS, AUTH_PUBLIC_ENDPOINTS, Env } from '../constants';
import { useAuthStore } from '../stores/auth.store';
import { ApiError } from './errors';
import { tokenManager } from './token-manager';

declare module 'axios' {
  export interface AxiosRequestConfig {
    /** Marks a retried request after a successful token refresh. */
    _retry?: boolean;
    /** Skips the 401 refresh-and-retry flow (used for refresh itself). */
    _skipAuthRefresh?: boolean;
  }
}

const axiosInstance: AxiosInstance = axios.create({
  baseURL: Env.apiBaseUrl,
  timeout: 15_000,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
});

let refreshPromise: Promise<string> | null = null;

function isPublicAuthEndpoint(url?: string): boolean {
  if (!url) return false;
  return AUTH_PUBLIC_ENDPOINTS.some((endpoint) => url.includes(endpoint));
}

async function refreshAccessToken(): Promise<string> {
  const refreshToken = await tokenManager.getRefreshToken();
  if (!refreshToken) {
    throw ApiError.fromUnknown(new Error('No refresh token available'));
  }

  const { data } = await axiosInstance.post<
    ApiSuccessResponse<{ accessToken: string; refreshToken: string }>
  >(API_ENDPOINTS.auth.refresh, { refreshToken }, { _skipAuthRefresh: true });

  const { accessToken, refreshToken: nextRefreshToken } = data.data;
  useAuthStore.getState().setAccessToken(accessToken);
  await tokenManager.setRefreshToken(nextRefreshToken);

  return accessToken;
}

function queueRefresh(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

axiosInstance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const accessToken = useAuthStore.getState().accessToken;
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as InternalAxiosRequestConfig | undefined;

    if (
      !originalRequest ||
      originalRequest._skipAuthRefresh ||
      originalRequest._retry ||
      error.response?.status !== 401 ||
      isPublicAuthEndpoint(originalRequest.url)
    ) {
      return Promise.reject(ApiError.fromUnknown(error));
    }

    originalRequest._retry = true;

    try {
      const accessToken = await queueRefresh();
      originalRequest.headers.Authorization = `Bearer ${accessToken}`;
      return axiosInstance(originalRequest);
    } catch (refreshError) {
      await tokenManager.clearRefreshToken();
      useAuthStore.getState().clearSession();
      return Promise.reject(ApiError.fromUnknown(refreshError));
    }
  },
);

/**
 * Thin typed wrapper around the shared Axios instance.
 * Unwraps the backend `{ success, data }` envelope so services work with `T` directly.
 */
export const apiClient = {
  get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return axiosInstance
      .get<ApiSuccessResponse<T>>(url, config)
      .then((response) => response.data.data);
  },

  post<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return axiosInstance
      .post<ApiSuccessResponse<T>>(url, body, config)
      .then((response) => response.data.data);
  },

  put<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return axiosInstance
      .put<ApiSuccessResponse<T>>(url, body, config)
      .then((response) => response.data.data);
  },

  patch<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return axiosInstance
      .patch<ApiSuccessResponse<T>>(url, body, config)
      .then((response) => response.data.data);
  },

  delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return axiosInstance
      .delete<ApiSuccessResponse<T>>(url, config)
      .then((response) => response.data.data);
  },
};
