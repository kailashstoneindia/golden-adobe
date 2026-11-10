import { randomUUID } from 'crypto';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { DeliveryPhotoKind } from '@golden-abode/types';
import { OBJECT_STORAGE, ObjectStorage, PresignedPost } from '../catalog/media/object-storage';

const PHOTO_CONTENT_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
};
const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
const PHOTO_PRESIGN_TTL_SECONDS = 300;

// Proof photos (handover, delivered, failed). Keys are minted per group and
// kind, and a key is only accepted back if it carries that same prefix, so a
// caller cannot attach someone else's object (or a different kind of photo)
// to a job.
@Injectable()
export class DeliveryPhotoService {
  constructor(@Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage) {}

  async createUploadUrl(
    groupId: string,
    kind: DeliveryPhotoKind,
    contentType: string,
  ): Promise<PresignedPost> {
    const extension = PHOTO_CONTENT_TYPES[contentType];
    if (!extension) {
      throw new BadRequestException('contentType must be image/jpeg or image/png');
    }
    return this.storage.presignPost({
      key: `delivery/${groupId}/${kind}-${randomUUID()}.${extension}`,
      contentType,
      maxBytes: PHOTO_MAX_BYTES,
      expiresInSeconds: PHOTO_PRESIGN_TTL_SECONDS,
    });
  }

  async assertUploadedKey(groupId: string, kind: DeliveryPhotoKind, key: string): Promise<void> {
    const prefix = `delivery/${groupId}/${kind}-`;
    const isImage = /\.(jpg|png)$/.test(key);
    if (!key.startsWith(prefix) || !isImage) {
      throw new BadRequestException('photoKey does not belong to this delivery');
    }
    if (!(await this.storage.head(key))) {
      throw new BadRequestException('no uploaded photo found for this key');
    }
  }
}
