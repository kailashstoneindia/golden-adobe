import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

const ALLOWED_DOCUMENT_CONTENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

export class CreateDocumentUploadUrlDto {
  @ApiProperty({ enum: ALLOWED_DOCUMENT_CONTENT_TYPES, example: 'application/pdf' })
  @IsIn(ALLOWED_DOCUMENT_CONTENT_TYPES)
  contentType: string;
}
