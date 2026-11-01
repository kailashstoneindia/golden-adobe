import { IsIn, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const ALLOWED_DOCUMENT_CONTENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

// 'lead' (the default) mints a key under artisans/<id>/..., the same shape
// confirmDocumentUpload expects and sets as the artisan's own documentUrl.
// 'team_member' mints a key under artisans/<id>/team/..., for a mobile
// client building a team member's documentUrl — there is no confirm step
// for that one (team-member documents have no existence check, by design,
// see ArtisansService.assertOwnedDocumentKey's own comment); the client
// just uploads to the presigned URL, then passes the resulting key
// straight through as documentUrl on CreateTeamMemberDto/
// UpdateTeamMemberDto, which already validates the artisans/<id>/ prefix.
const UPLOAD_PURPOSES = ['lead', 'team_member'] as const;

export class CreateDocumentUploadUrlDto {
  @ApiProperty({ enum: ALLOWED_DOCUMENT_CONTENT_TYPES, example: 'application/pdf' })
  @IsIn(ALLOWED_DOCUMENT_CONTENT_TYPES)
  contentType: string;

  @ApiPropertyOptional({ enum: UPLOAD_PURPOSES, default: 'lead' })
  @IsOptional()
  @IsIn(UPLOAD_PURPOSES)
  purpose?: (typeof UPLOAD_PURPOSES)[number];
}
