import type { CatalogUploadFile } from '../../types';
import { ERROR_MESSAGES } from '../../constants';

export class CatalogFileToolsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogFileToolsError';
  }
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return globalThis.btoa(binary);
}

export async function saveAndShareCatalogExport(options: {
  buffer: ArrayBuffer;
  filename: string;
}): Promise<void> {
  try {
    const FileSystem = await import('expo-file-system/legacy');
    const Sharing = await import('expo-sharing');
    if (!FileSystem.cacheDirectory) {
      throw new CatalogFileToolsError(ERROR_MESSAGES.vendorCatalogExportFailed);
    }

    const fileUri = `${FileSystem.cacheDirectory}${options.filename}`;
    await FileSystem.writeAsStringAsync(fileUri, toBase64(options.buffer), {
      encoding: FileSystem.EncodingType.Base64,
    });

    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      throw new CatalogFileToolsError(ERROR_MESSAGES.vendorCatalogExportFailed);
    }

    await Sharing.shareAsync(fileUri, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: 'Save catalog export',
    });
  } catch (error: unknown) {
    if (error instanceof CatalogFileToolsError) {
      throw error;
    }
    throw new CatalogFileToolsError(ERROR_MESSAGES.vendorCatalogFileToolsMissing);
  }
}

export async function pickCatalogWorkbook(): Promise<CatalogUploadFile | null> {
  try {
    const DocumentPicker = await import('expo-document-picker');
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/octet-stream',
      ],
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled || !result.assets[0]) {
      return null;
    }

    const asset = result.assets[0];
    return {
      uri: asset.uri,
      name: asset.name || 'catalog-upload.xlsx',
      mimeType:
        asset.mimeType ||
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  } catch {
    throw new CatalogFileToolsError(ERROR_MESSAGES.vendorCatalogFileToolsMissing);
  }
}
