import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

// Same shape as AdminService's RejectUserDto — no persisted-reason column
// in the §4.1 schema, so this is logged only, not stored.
export class RejectArtisanVerificationDto {
  @ApiPropertyOptional({ description: 'Optional note stored in logs only' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
