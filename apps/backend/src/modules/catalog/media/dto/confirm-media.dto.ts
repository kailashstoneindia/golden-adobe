import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class ConfirmMediaDto {
  @ApiProperty({ description: 'The mediaId returned by the upload-url request.' })
  @IsUUID()
  mediaId!: string;

  @ApiPropertyOptional({
    description:
      'Make this the primary image. The first image of a product is always primary regardless.',
  })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @ApiPropertyOptional({ description: 'Indicative photo, not the exact item received.' })
  @IsOptional()
  @IsBoolean()
  isRepresentative?: boolean;
}
