import { ARTISAN_CONSTANTS, ARTISAN_DOCUMENT_CONTENT_TYPES, ERROR_MESSAGES } from '../../constants';
import type { ArtisanDocumentFile, ArtisanDocumentUploadUrl } from '../../types';

export class ArtisanDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArtisanDocumentError';
  }
}

const EXTENSION_CONTENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

// Pickers report `image/jpg` or nothing at all on some Android devices; the
// presign policy pins Content-Type exactly, so normalise before asking for it.
function resolveContentType(name: string, mimeType: string | undefined): string | null {
  const normalised = mimeType === 'image/jpg' ? 'image/jpeg' : mimeType;
  if (normalised && (ARTISAN_DOCUMENT_CONTENT_TYPES as readonly string[]).includes(normalised)) {
    return normalised;
  }
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_CONTENT_TYPES[extension] ?? null;
}

export async function pickArtisanDocument(): Promise<ArtisanDocumentFile | null> {
  let DocumentPicker: typeof import('expo-document-picker');
  try {
    DocumentPicker = await import('expo-document-picker');
  } catch {
    throw new ArtisanDocumentError(ERROR_MESSAGES.artisanDocumentToolsMissing);
  }

  const result = await DocumentPicker.getDocumentAsync({
    type: [...ARTISAN_DOCUMENT_CONTENT_TYPES],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets[0]) {
    return null;
  }

  const asset = result.assets[0];
  const name = asset.name || 'document';
  const mimeType = resolveContentType(name, asset.mimeType);
  if (!mimeType) {
    throw new ArtisanDocumentError(ERROR_MESSAGES.artisanDocumentTypeInvalid);
  }
  if (asset.size != null && asset.size > ARTISAN_CONSTANTS.documentMaxBytes) {
    throw new ArtisanDocumentError(ERROR_MESSAGES.artisanDocumentTooLarge);
  }

  return { uri: asset.uri, name, mimeType, size: asset.size ?? null };
}

/**
 * Uploads straight to S3 with the presigned POST. Goes through `fetch`, not
 * the API client — S3 must not receive our bearer token or JSON headers.
 * The policy fields go first and the file last, or S3 rejects the form.
 */
export async function uploadToPresignedPost(
  upload: ArtisanDocumentUploadUrl,
  file: ArtisanDocumentFile,
): Promise<void> {
  const formData = new FormData();
  Object.entries(upload.fields).forEach(([field, value]) => formData.append(field, value));
  formData.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as never);

  const response = await fetch(upload.url, { method: 'POST', body: formData });
  if (!response.ok) {
    throw new ArtisanDocumentError(ERROR_MESSAGES.artisanDocumentUploadFailed);
  }
}
