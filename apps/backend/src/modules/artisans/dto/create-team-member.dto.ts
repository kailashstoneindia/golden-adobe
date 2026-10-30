import { IsOptional, IsString, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArtisanTeamMemberInputDto } from '@golden-abode/types';

// Every field optional per spec §8.3 — team members are not platform
// users, just data the lead artisan records about their own crew.
export class CreateTeamMemberDto implements ArtisanTeamMemberInputDto {
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
