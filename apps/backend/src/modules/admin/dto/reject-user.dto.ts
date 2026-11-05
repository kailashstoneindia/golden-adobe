import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectUserDto {
  @ApiPropertyOptional({
    description:
      'Why the account is rejected. Required for a vendor with a shop (stored on the vendor, decision 0048); for an ustaad it runs Reject verification; otherwise logged only.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
