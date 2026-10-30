import { IsOptional, IsString, IsNotEmpty, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateHireRequestDto as CreateHireRequestContract } from '@golden-abode/types';

// Customer-initiated (spec §8.1) — always lands at PENDING_ADMIN_REVIEW,
// never anything else, so there is no status field here for the client
// to set.
export class CreateHireRequestDto implements CreateHireRequestContract {
  @ApiProperty({ example: 'a1b2c3d4-...' })
  @IsUUID()
  artisanId: string;

  @ApiProperty({ example: '12 MG Road, Bengaluru' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  addressText: string;

  @ApiPropertyOptional({ example: 'Leaking pipe under kitchen sink' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  notes?: string;
}
