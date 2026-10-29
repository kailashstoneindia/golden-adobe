import { IsOptional, IsString, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArtisanTeamMemberInputDto } from '@golden-abode/types';

// Same shape as CreateTeamMemberDto — a partial update is still "every
// field optional", since every field already was.
export class UpdateTeamMemberDto implements Partial<ArtisanTeamMemberInputDto> {
  @ApiPropertyOptional({ example: 'Suresh' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name?: string;

  @ApiPropertyOptional({ example: 'Helper' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  roleOnTeam?: string;

  @ApiPropertyOptional({ example: '9876543210' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  phone?: string;

  @ApiPropertyOptional({ example: 'artisans/a1b2.../team/doc-<uuid>.jpg' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  documentUrl?: string;
}
