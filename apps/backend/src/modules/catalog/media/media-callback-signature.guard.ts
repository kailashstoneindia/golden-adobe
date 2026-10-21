import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import type { StorageConfig } from '../../../config/storage.config';
import { MEDIA_STORAGE_CONFIG } from './object-storage';
import { computeSignature, isFreshTimestamp, signaturesMatch } from './media-callback-signature';

// Authenticates the media Lambda. There is no JWT here: the Lambda is not a
// user. Every failure is the same 401 so a caller learns nothing about which
// check it missed.
@Injectable()
export class MediaCallbackSignatureGuard implements CanActivate {
  constructor(@Inject(MEDIA_STORAGE_CONFIG) private readonly config: StorageConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { rawBody?: Buffer }>();
    const timestamp = req.headers['x-media-timestamp'];
    const signature = req.headers['x-media-signature'];

    const valid =
      Boolean(this.config.callbackSecret) &&
      typeof timestamp === 'string' &&
      typeof signature === 'string' &&
      Buffer.isBuffer(req.rawBody) &&
      isFreshTimestamp(timestamp, Math.floor(Date.now() / 1000)) &&
      signaturesMatch(
        computeSignature(this.config.callbackSecret, timestamp, req.rawBody),
        signature,
      );

    if (!valid) throw new UnauthorizedException('Invalid media callback signature');
    return true;
  }
}
