import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type { ApiErrorResponse, ApiSuccessResponse } from '@golden-abode/types';

import { APP_CONSTANTS } from '@/constants/appConstants';
import { ROUTES } from '@/constants/routes';
import { tokenStorage } from '@/services/storage/tokenStorage';

export class ApiClientError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'ApiClientError';
    this.statusCode = statusCode;
  }
}

const apiClient = axios.create({
  baseURL: APP_CONSTANTS.apiBaseUrl,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const accessToken = tokenStorage.getAccessToken();
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorResponse>) => {
    if (error.response?.status === 401) {
      tokenStorage.clearTokens();
      if (window.location.pathname !== ROUTES.login) {
        window.location.assign(ROUTES.login);
      }
    }
    const message = error.response?.data?.message ?? 'Request failed';
    const statusCode = error.response?.status ?? 500;
    return Promise.reject(new ApiClientError(message, statusCode));
  },
);

export async function getRequest<TResponse>(url: string): Promise<TResponse> {
  const response = await apiClient.get<ApiSuccessResponse<TResponse>>(url);
  return response.data.data;
}

export async function postRequest<TResponse, TBody>(
  url: string,
  body: TBody,
): Promise<TResponse> {
  const response = await apiClient.post<ApiSuccessResponse<TResponse>>(url, body);
  return response.data.data;
}

export async function patchRequest<TResponse, TBody>(
  url: string,
  body?: TBody,
): Promise<TResponse> {
  const response = await apiClient.patch<ApiSuccessResponse<TResponse>>(url, body ?? {});
  return response.data.data;
}
