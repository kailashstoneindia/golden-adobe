import type {
  CategoryAttributesResponse,
  CategoryNode,
  ImportResult,
  ListProductsQuery,
  ProductDetail,
  ProductListResponse,
  ReviewQueueRow,
} from '@/types/catalog.types';

import { API_ENDPOINTS } from '@/constants/apiEndpoints';
import {
  downloadRequest,
  getRequest,
  patchRequest,
  postRequest,
  uploadRequest,
} from '@/services/api/apiClient';

function buildProductsQueryString(query: ListProductsQuery): string {
  const params = new URLSearchParams();
  if (query.search) params.set('search', query.search);
  if (query.categoryId) params.set('categoryId', query.categoryId);
  if (query.status) params.set('status', query.status);
  if (query.page) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));
  const queryString = params.toString();
  return queryString ? `?${queryString}` : '';
}

export const catalogService = {
  fetchCategoryTree(): Promise<CategoryNode[]> {
    return getRequest<CategoryNode[]>(API_ENDPOINTS.catalog.categories);
  },

  fetchCategoryAttributes(categoryId: string): Promise<CategoryAttributesResponse> {
    return getRequest<CategoryAttributesResponse>(
      API_ENDPOINTS.catalog.categoryAttributes(categoryId),
    );
  },

  fetchProducts(query: ListProductsQuery): Promise<ProductListResponse> {
    return getRequest<ProductListResponse>(
      `${API_ENDPOINTS.catalog.products}${buildProductsQueryString(query)}`,
    );
  },

  fetchProduct(productId: string): Promise<ProductDetail> {
    return getRequest<ProductDetail>(API_ENDPOINTS.catalog.productById(productId));
  },

  publishProduct(productId: string): Promise<ProductDetail> {
    return patchRequest<ProductDetail, undefined>(API_ENDPOINTS.catalog.publishProduct(productId));
  },

  unpublishProduct(productId: string): Promise<ProductDetail> {
    return patchRequest<ProductDetail, undefined>(
      API_ENDPOINTS.catalog.unpublishProduct(productId),
    );
  },

  downloadTemplate(categoryId: string, categorySlug: string): Promise<string> {
    return downloadRequest(
      API_ENDPOINTS.catalogImport.template(categoryId),
      `${categorySlug}-template.xlsx`,
    );
  },

  uploadImport(categoryId: string, file: File): Promise<ImportResult> {
    return uploadRequest<ImportResult>(API_ENDPOINTS.catalogImport.upload(categoryId), file);
  },

  fetchReviewQueue(): Promise<ReviewQueueRow[]> {
    return getRequest<ReviewQueueRow[]>(API_ENDPOINTS.catalogReview.list);
  },

  linkReviewRow(importRowId: string, masterProductId: string): Promise<unknown> {
    return postRequest<unknown, { masterProductId: string }>(
      API_ENDPOINTS.catalogReview.link(importRowId),
      { masterProductId },
    );
  },

  rejectReviewRow(importRowId: string, reason: string): Promise<unknown> {
    return postRequest<unknown, { reason: string }>(
      API_ENDPOINTS.catalogReview.reject(importRowId),
      { reason },
    );
  },
};
