import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { MediaProcessingResultDto } from './dto/media-processing-result.dto';
import { MediaCallbackSignatureGuard } from './media-callback-signature.guard';
import { MediaService } from './media.service';

// Called by the media Lambda, not by a person (decision 0033). No JWT: the HMAC
// signature is the credential. The only thing it can do is move a row out of
// "processing", so a leaked secret could flip a status but never read data.
// Hidden from Swagger on purpose.
@ApiExcludeController()
@Controller('internal/media')
@UseGuards(MediaCallbackSignatureGuard)
export class InternalMediaController {
  constructor(private readonly media: MediaService) {}

  @Post(':mediaId/processing-result')
  @HttpCode(200)
  processingResult(
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @Body() dto: MediaProcessingResultDto,
  ) {
    return this.media.applyProcessingResult(mediaId.toLowerCase(), dto);
  }
}
