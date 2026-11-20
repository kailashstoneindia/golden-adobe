import type {
  CategoryAttributesResponse,
  CategoryNode,
  ImportResult,
  ListProductsQuery,
  ProductDetail,
  ProductListResponse,
  ReviewQueueRow,
  BulkPublishRequest,
  BulkPublishResult,
  CreateProductRequest,
  HsnCodeOption,
  UpdateProductRequest,
} from '@/types/catalog.types';
import type { MergeResultDto, ProductReadinessDto } from '@golden-abode/types';

import { API_ENDPOINTS } from '@/constants/apiEndpoints';
import {
  deleteRequest,
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
  if (query.brandId) params.set('brandId', query.brandId);
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

  renameProduct(productId: string, name: string): Promise<ProductDetail> {
    return patchRequest<ProductDetail, { name: string }>(
      API_ENDPOINTS.catalog.productById(productId),
      { name },
    );
  },

  unpublishProduct(productId: string): Promise<ProductDetail> {
    return patchRequest<ProductDetail, undefined>(
      API_ENDPOINTS.catalog.unpublishProduct(productId),
    );
  },

  bulkPublishProducts(body: BulkPublishRequest): Promise<BulkPublishResult> {
    return patchRequest<BulkPublishResult, BulkPublishRequest>(
      API_ENDPOINTS.catalog.bulkPublish,
      body,
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

  // ── Decision 0063 ──────────────────────────────────────────────────────
  fetchReadiness(productId: string): Promise<ProductReadinessDto> {
    return getRequest<ProductReadinessDto>(API_ENDPOINTS.catalog.readiness(productId));
  },

  createProduct(body: CreateProductRequest): Promise<ProductDetail> {
    return postRequest<ProductDetail, CreateProductRequest>(API_ENDPOINTS.catalog.products, body);
  },

  updateProduct(productId: string, body: UpdateProductRequest): Promise<ProductDetail> {
    return patchRequest<ProductDetail, UpdateProductRequest>(
      API_ENDPOINTS.catalog.productById(productId),
      body,
    );
  },

  retireProduct(productId: string): Promise<ProductDetail> {
    return patchRequest<ProductDetail, undefined>(API_ENDPOINTS.catalog.retire(productId));
  },

  restoreProduct(productId: string): Promise<ProductDetail> {
    return patchRequest<ProductDetail, undefined>(API_ENDPOINTS.catalog.restore(productId));
  },

  deleteProduct(productId: string): Promise<void> {
    return deleteRequest(API_ENDPOINTS.catalog.productById(productId));
  },

  mergeProduct(productId: string, intoProductId: string): Promise<MergeResultDto> {
    return postRequest<MergeResultDto, { intoProductId: string }>(
      API_ENDPOINTS.catalog.merge(productId),
      { intoProductId },
    );
  },

  listHsnCodes(search: string): Promise<HsnCodeOption[]> {
    const query = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
    return getRequest<HsnCodeOption[]>(`${API_ENDPOINTS.catalog.hsnCodes}${query}`);
  },

  createHsnCode(body: HsnCodeOption): Promise<HsnCodeOption> {
    return postRequest<HsnCodeOption, HsnCodeOption>(API_ENDPOINTS.catalog.hsnCodes, body);
  },

  setCategoryHsnDefault(categoryId: string, hsnCodeDefault: string | null): Promise<unknown> {
    return patchRequest<unknown, { hsnCodeDefault: string | null }>(
      API_ENDPOINTS.catalog.categoryById(categoryId),
      { hsnCodeDefault },
    );
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
