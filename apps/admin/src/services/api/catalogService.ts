import type {
  CategoryAttributesResponse,
  CategoryNode,
  ImportUploadResult,
  ListProductsQuery,
  ProductDetail,
  ProductListResponse,
  BulkPublishRequest,
  BulkPublishResult,
  CreateProductRequest,
  HsnCodeOption,
  ProductKeyLookup,
  UpdateProductRequest,
} from '@/types/catalog.types';
import type {
  CatalogImportJobDto,
  MergeResultDto,
  PaginatedResponse,
  ProductReadinessDto,
  ReviewQueueItem,
  ReviewRowPrefillDto,
} from '@golden-abode/types';

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

  uploadImport(categoryId: string, file: File): Promise<ImportUploadResult> {
    return uploadRequest<ImportUploadResult>(API_ENDPOINTS.catalogImport.upload(categoryId), file);
  },

  listImportJobs(page: number): Promise<PaginatedResponse<CatalogImportJobDto>> {
    return getRequest(`${API_ENDPOINTS.catalogImport.jobs}?page=${page}&limit=10`);
  },

  getImportJob(jobId: string): Promise<CatalogImportJobDto> {
    return getRequest(API_ENDPOINTS.catalogImport.job(jobId));
  },

  getImportErrorUrl(jobId: string): Promise<{ url: string }> {
    return getRequest(API_ENDPOINTS.catalogImport.jobErrors(jobId));
  },

  undoImportJob(jobId: string): Promise<{ deleted: number; kept: number }> {
    return postRequest<{ deleted: number; kept: number }, undefined>(
      API_ENDPOINTS.catalogImport.jobUndo(jobId),
      undefined,
    );
  },

  // ── Decision 0063 ──────────────────────────────────────────────────────
  lookupProductKeys(keys: string[], brandId?: string | null): Promise<ProductKeyLookup> {
    return postRequest<ProductKeyLookup, { keys: string[]; brandId?: string }>(
      API_ENDPOINTS.catalog.lookupCodes,
      brandId ? { keys, brandId } : { keys },
    );
  },

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

  fetchReviewQueue(): Promise<ReviewQueueItem[]> {
    return getRequest<ReviewQueueItem[]>(API_ENDPOINTS.catalogReview.list);
  },

  fetchReviewPrefill(importRowId: string): Promise<ReviewRowPrefillDto> {
    return getRequest<ReviewRowPrefillDto>(API_ENDPOINTS.catalogReview.prefill(importRowId));
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
