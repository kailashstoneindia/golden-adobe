import { IsEnum, IsInt, IsOptional, IsString, IsNotEmpty, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArtisanOnboardDto as ArtisanOnboardContract,
  TRADE_TYPES,
  TradeType,
} from '@golden-abode/types';

export class OnboardArtisanDto implements ArtisanOnboardContract {
  @ApiProperty({ enum: TRADE_TYPES, example: 'PLUMBER' })
  @IsEnum(TRADE_TYPES)
  tradeType: TradeType;

  // Required (docs/artisan.md §3's Step 1 spec — service area is a
  // required onboarding field, previously only enforced client-side).
  // Matches the shared ArtisanOnboardDto contract's own optional `?`
  // (customer/admin reads of an already-onboarded artisan can still see a
  // null pincode from data created before this change), but new
  // onboarding must supply it.
  @ApiProperty({ example: '560001' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  servicePincode: string;

  @ApiPropertyOptional({ example: 6 })
  @IsOptional()
  @IsInt()
  @Min(0)
  experienceYears?: number;

  @ApiPropertyOptional({ example: 'Reliable plumber, 6 years in Bengaluru.' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  bio?: string;
}
