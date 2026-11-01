import { IsEnum, IsInt, IsOptional, IsString, IsNotEmpty, Matches, Min } from 'class-validator';
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
  // onboarding must supply it. Format-validated with the same 6-digit
  // Indian PIN code regex SearchArtisansQueryDto.pincode and the catalog
  // search module's own SearchQueryDto.pincode already use (code review
  // flagged that without this, a malformed pincode accepted here could
  // never match that search filter's stricter pattern, silently making
  // the artisan unfindable by pincode search with no error surfaced).
  @ApiProperty({ example: '560001' })
  @Matches(/^[1-9][0-9]{5}$/, { message: 'servicePincode must be a 6-digit Indian PIN code' })
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
