import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

// Body of the media Lambda's signed callback. Deliberately tiny: the only thing
// it can do is move a row out of 'processing'.
export class MediaProcessingResultDto {
  @ApiProperty({ enum: ['ready', 'failed'] })
  @IsIn(['ready', 'failed'])
  status!: 'ready' | 'failed';

  @ApiPropertyOptional({ description: 'Why generation failed, shown to the admin.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
