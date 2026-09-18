import type {
  ChoosePendingCandidateRequest,
  PendingConfirmation,
  VendorCatalogExportCount,
  VendorCatalogExportScope,
  VendorImportResult,
} from '@golden-abode/types';
import { isEmpty, isNil, omitBy } from 'lodash';

import { apiClient } from '../api/client';
import { API_ENDPOINTS } from '../constants';
import type { CatalogUploadFile } from '../types';

type ExportQueryParams = {
  leafCategoryIds: string[];
  brandIds?: string[];
  sinceDate?: string;
};

function buildExportQueryParams(scope: VendorCatalogExportScope): ExportQueryParams {
  const cleaned = omitBy(
    {
      leafCategoryIds: scope.leafCategoryIds,
      brandIds: isEmpty(scope.brandIds) ? undefined : scope.brandIds,
      sinceDate: scope.sinceDate,
    },
    isNil,
  );

  return cleaned as ExportQueryParams;
}

function serializeExportParams(params: ExportQueryParams): string {
  const searchParams = new URLSearchParams();

  params.leafCategoryIds.forEach((categoryId) => {
    searchParams.append('leafCategoryIds', categoryId);
  });

  params.brandIds?.forEach((brandId) => {
    searchParams.append('brandIds', brandId);
  });

  if (params.sinceDate) {
    searchParams.append('sinceDate', params.sinceDate);
  }

  return searchParams.toString();
}

function buildUploadFormData(file: CatalogUploadFile): FormData {
  const formData = new FormData();
  // React Native FormData expects { uri, name, type }, not a web Blob.
  formData.append('file', {
    uri: file.uri,
    name: file.name,
    type: file.mimeType,
  } as unknown as Blob);
  return formData;
}

export const vendorCatalogImportService = {
  fetchExportCount(scope: VendorCatalogExportScope): Promise<VendorCatalogExportCount> {
    const params = buildExportQueryParams(scope);
    return apiClient.get<VendorCatalogExportCount>(API_ENDPOINTS.vendorCatalogImport.exportCount, {
      params,
      paramsSerializer: serializeExportParams,
    });
  },

  downloadExport(scope: VendorCatalogExportScope): Promise<ArrayBuffer> {
    const params = buildExportQueryParams(scope);
    return apiClient.getBinary(API_ENDPOINTS.vendorCatalogImport.export, {
      params,
      paramsSerializer: serializeExportParams,
    });
  },

  uploadCatalog(file: CatalogUploadFile): Promise<VendorImportResult> {
    return apiClient.postFormData<VendorImportResult>(
      API_ENDPOINTS.vendorCatalogImport.upload,
      buildUploadFormData(file),
    );
  },

  fetchPendingConfirmations(): Promise<PendingConfirmation[]> {
    return apiClient.get<PendingConfirmation[]>(
      API_ENDPOINTS.vendorCatalogImport.pendingConfirmations,
    );
  },

  confirmPendingListing(vendorListingId: string): Promise<unknown> {
    return apiClient.post(API_ENDPOINTS.vendorCatalogImport.confirm(vendorListingId));
  },

  choosePendingCandidate(
    vendorListingId: string,
    body: ChoosePendingCandidateRequest,
  ): Promise<unknown> {
    return apiClient.post(API_ENDPOINTS.vendorCatalogImport.choose(vendorListingId), body);
  },

  rejectPendingListing(vendorListingId: string): Promise<{ message: string }> {
    return apiClient.post<{ message: string }>(
      API_ENDPOINTS.vendorCatalogImport.reject(vendorListingId),
    );
  },
};
