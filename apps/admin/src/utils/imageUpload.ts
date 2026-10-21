import { MEDIA_CONSTANTS } from '@/constants/mediaConstants';

// Returns a message for a file that should not be sent, or null if it is fine.
// The server and S3 check again; this only spares the admin a wasted upload.
export function validateImageFile(file: {
  name: string;
  type: string;
  size: number;
}): string | null {
  const allowed: readonly string[] = MEDIA_CONSTANTS.allowedContentTypes;
  if (!allowed.includes(file.type)) {
    return `${file.name}: only JPEG, PNG and WebP images are supported`;
  }
  if (file.size === 0) {
    return `${file.name}: the file is empty`;
  }
  if (file.size > MEDIA_CONSTANTS.maxUploadBytes) {
    return `${file.name}: larger than ${formatBytes(MEDIA_CONSTANTS.maxUploadBytes)}`;
  }
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Runs the worker over every item with at most `limit` in flight at once, in
// start order. One failure does not stop the others: each worker handles its own
// errors.
export async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const item = items[next++];
      await worker(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
}
