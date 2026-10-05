// Product image upload (decision 0033). The server enforces its own limits, and
// S3 enforces them again through the presigned policy; these only let the admin
// see a clear message before anything is sent.
export const MEDIA_CONSTANTS = {
  // HEIC is deliberately absent: the image processor cannot decode it.
  allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
  maxUploadBytes: 10 * 1024 * 1024,
  maxConcurrentUploads: 3,
  // While any image is still being processed, the list is re-read this often.
  processingPollMs: 2000,
} as const;
