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

export async function postRequest<TResponse, TBody>(url: string, body: TBody): Promise<TResponse> {
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

/**
 * Multipart upload. Deliberately does NOT set Content-Type — the browser must
 * generate it so the multipart boundary is correct; overriding it with the
 * client's JSON default silently breaks the upload.
 */
export async function uploadRequest<TResponse>(
  url: string,
  file: File,
  fieldName = 'file',
): Promise<TResponse> {
  const formData = new FormData();
  formData.append(fieldName, file);
  const response = await apiClient.post<ApiSuccessResponse<TResponse>>(url, formData, {
    headers: { 'Content-Type': undefined },
  });
  return response.data.data;
}

/**
 * Fetches a binary response (a generated .xlsx template) and triggers a save.
 * Returns the filename used, taken from Content-Disposition when the server
 * supplies one.
 */
export async function downloadRequest(url: string, fallbackFilename: string): Promise<string> {
  const response = await apiClient.get<Blob>(url, { responseType: 'blob' });

  const disposition = response.headers['content-disposition'] as string | undefined;
  const match = disposition?.match(/filename="?([^"]+)"?/);
  const filename = match?.[1] ?? fallbackFilename;

  const objectUrl = window.URL.createObjectURL(response.data);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(objectUrl);

  return filename;
}
