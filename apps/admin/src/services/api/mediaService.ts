import type { MediaUploadTicket, ProductMedia } from '@/types/catalog.types';

import { API_ENDPOINTS } from '@/constants/apiEndpoints';
import {
  deleteRequest,
  getRequest,
  patchRequest,
  postRequest,
  putRequest,
} from '@/services/api/apiClient';

export type UploadProgress = (fraction: number) => void;

// Step 2 of an upload: the browser sends the file STRAIGHT to S3, not through the
// API. This is deliberately not an apiClient call: it goes to another origin, so
// it must not carry the admin's Authorization header, and it uses XMLHttpRequest
// because fetch cannot report upload progress.
//
// S3 requires every policy field to come BEFORE the file, so the file is the last
// field appended. S3 itself enforces the size limit and content type.
export function uploadToS3(
  upload: MediaUploadTicket['upload'],
  file: File,
  onProgress?: UploadProgress,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const [name, value] of Object.entries(upload.fields)) form.append(name, value);
    form.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', upload.url);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        resolve();
        return;
      }
      reject(new Error(s3ErrorMessage(xhr.responseText, xhr.status)));
    };
    xhr.onerror = () => reject(new Error('Network error while uploading the file'));
    xhr.onabort = () => reject(new Error('The upload was cancelled'));

    xhr.send(form);
  });
}

// S3 answers failures with an XML body. Only the cases an admin can act on are
// translated; anything else becomes a generic message with the status.
function s3ErrorMessage(body: string, status: number): string {
  if (/EntityTooLarge|exceeds the maximum allowed size/i.test(body)) {
    return 'The file is larger than the allowed size';
  }
  if (/AccessDenied|Policy Condition failed|InvalidPolicyDocument/i.test(body)) {
    return 'The upload was refused (it may have expired: try again)';
  }
  return `Upload failed (${status})`;
}

export const mediaService = {
  list(productId: string): Promise<ProductMedia[]> {
    return getRequest<ProductMedia[]>(API_ENDPOINTS.media.list(productId));
  },

  // Step 1: ask the API for a presigned upload ticket.
  requestUpload(
    productId: string,
    file: { type: string; size: number },
  ): Promise<MediaUploadTicket> {
    return postRequest<MediaUploadTicket, { contentType: string; sizeBytes: number }>(
      API_ENDPOINTS.media.uploads(productId),
      { contentType: file.type, sizeBytes: file.size },
    );
  },

  // Step 3: tell the API the file is in S3 so it can verify and record it.
  confirmUpload(productId: string, mediaId: string): Promise<ProductMedia> {
    return postRequest<ProductMedia, { mediaId: string }>(API_ENDPOINTS.media.list(productId), {
      mediaId,
    });
  },

  update(
    productId: string,
    mediaId: string,
    body: { isPrimary?: boolean; isRepresentative?: boolean },
  ): Promise<ProductMedia> {
    return patchRequest<ProductMedia, typeof body>(
      API_ENDPOINTS.media.byId(productId, mediaId),
      body,
    );
  },

  reorder(productId: string, mediaIds: string[]): Promise<ProductMedia[]> {
    return putRequest<ProductMedia[], { mediaIds: string[] }>(
      API_ENDPOINTS.media.order(productId),
      { mediaIds },
    );
  },

  remove(productId: string, mediaId: string): Promise<void> {
    return deleteRequest(API_ENDPOINTS.media.byId(productId, mediaId));
  },

  reprocess(productId: string, mediaId: string): Promise<ProductMedia> {
    return postRequest<ProductMedia, Record<string, never>>(
      API_ENDPOINTS.media.reprocess(productId, mediaId),
      {},
    );
  },

  // The browser-to-S3 transport, a property so a test can replace it. jsdom with a
  // mock server cannot reliably carry a multipart body across Node versions (CI,
  // on Node 22, failed where Node 24 passed), so tests that are about everything
  // else swap this out. uploadToS3 itself is tested with a fake XMLHttpRequest.
  uploadFile: uploadToS3,

  // The whole flow for one file: ticket, then S3, then confirm.
  async uploadImage(
    productId: string,
    file: File,
    onProgress?: UploadProgress,
  ): Promise<ProductMedia> {
    const ticket = await this.requestUpload(productId, file);
    await this.uploadFile(ticket.upload, file, onProgress);
    return this.confirmUpload(productId, ticket.mediaId);
  },
};
