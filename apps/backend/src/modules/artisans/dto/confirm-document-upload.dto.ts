import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ConfirmDocumentUploadDto {
  @ApiProperty({ example: 'artisans/a1b2.../doc-<uuid>.pdf' })
  @IsString()
  @IsNotEmpty()
  key: string;
}
