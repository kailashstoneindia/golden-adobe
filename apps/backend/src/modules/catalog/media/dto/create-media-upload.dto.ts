import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, Min } from 'class-validator';

import { MEDIA_CONTENT_TYPES } from '../media-keys';

// The size and type are what the presigned POST policy will enforce at S3, so
// they are declared up front. The service re-checks the size against the
// configured maximum; the file itself is verified again at confirm time.
export class CreateMediaUploadDto {
  @ApiProperty({ enum: Object.keys(MEDIA_CONTENT_TYPES), example: 'image/jpeg' })
  @IsIn(Object.keys(MEDIA_CONTENT_TYPES), {
    message: `contentType must be one of: ${Object.keys(MEDIA_CONTENT_TYPES).join(', ')}`,
  })
  contentType!: string;

  @ApiProperty({ description: 'Exact size of the file in bytes.', example: 482133 })
  @IsInt()
  @Min(1)
  sizeBytes!: number;
}
