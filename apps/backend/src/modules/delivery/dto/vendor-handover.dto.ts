import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class HandoverPhotoUrlDto {
  @ApiProperty({ enum: ['image/jpeg', 'image/png'] })
  @IsIn(['image/jpeg', 'image/png'])
  contentType: string;
}

export class HandoverDto {
  @ApiPropertyOptional({ description: 'Key returned by the photo-url upload' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  photoKey?: string;
}
