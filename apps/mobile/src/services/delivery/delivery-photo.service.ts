import { APP_CONSTANTS, ERROR_MESSAGES } from '../../constants';
import { uploadToPresignedPost } from '../artisans';

export type DeliveryPhotoContentType = 'image/jpeg' | 'image/png';

/** `fields.key` is the photoKey sent to complete, fail or handover. */
export type PresignedPhotoUpload = {
  url: string;
  fields: Record<string, string>;
};

export type CapturedPhoto = {
  uri: string;
  contentType: DeliveryPhotoContentType;
};

export class DeliveryPhotoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeliveryPhotoError';
  }
}

type PhotoSource = 'camera' | 'library';

/**
 * Takes a proof photo. Returns null when the user backs out. The library
 * source exists for the simulator, which has no camera; screens offer it in
 * development builds only.
 */
export async function captureDeliveryPhoto(
  source: PhotoSource = 'camera',
): Promise<CapturedPhoto | null> {
  let ImagePicker: typeof import('expo-image-picker');
  try {
    ImagePicker = await import('expo-image-picker');
  } catch {
    throw new DeliveryPhotoError(ERROR_MESSAGES.deliveryPhotoToolsMissing);
  }

  const options = {
    mediaTypes: ['images'] as ['images'],
    quality: APP_CONSTANTS.deliveryPhotoQuality,
    allowsEditing: false,
    exif: false,
  };

  let result: Awaited<ReturnType<typeof ImagePicker.launchCameraAsync>>;
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      throw new DeliveryPhotoError(ERROR_MESSAGES.deliveryCameraDenied);
    }
    result = await ImagePicker.launchCameraAsync(options);
  } else {
    result = await ImagePicker.launchImageLibraryAsync(options);
  }

  const asset = result.canceled ? null : result.assets[0];
  if (!asset) {
    return null;
  }
  // The presign policy pins Content-Type to jpeg or png; compressed camera
  // output is JPEG, so anything that is not PNG is sent as JPEG.
  return {
    uri: asset.uri,
    contentType: asset.mimeType === 'image/png' ? 'image/png' : 'image/jpeg',
  };
}

/** Uploads straight to S3 and returns the photoKey. */
export async function uploadDeliveryPhoto(
  upload: PresignedPhotoUpload,
  photo: CapturedPhoto,
): Promise<string> {
  const photoKey = upload.fields.key;
  if (!photoKey) {
    throw new DeliveryPhotoError(ERROR_MESSAGES.deliveryPhotoUploadFailed);
  }
  try {
    await uploadToPresignedPost(upload, {
      uri: photo.uri,
      name: photo.contentType === 'image/png' ? 'proof.png' : 'proof.jpg',
      mimeType: photo.contentType,
      size: null,
    });
  } catch {
    throw new DeliveryPhotoError(ERROR_MESSAGES.deliveryPhotoUploadFailed);
  }
  return photoKey;
}
