import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsNotEmpty, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { UpdateArtisanProfileDto as UpdateArtisanProfileContract, TradeType } from '@golden-abode/types';

const TRADE_TYPES: TradeType[] = [
  'CARPENTER',
  'PLUMBER',
  'PAINTER',
  'ELECTRICIAN',
  'MASON',
  'TILE_LAYING',
  'OTHERS',
];

// Every field optional — PATCH semantics, same rationale as
// UpdateVendorProfileDto. Account details and documents live on their own
// endpoints (update-account-details.dto.ts handles the former; document
// upload is a separate presign/confirm flow).
export class UpdateArtisanProfileDto implements UpdateArtisanProfileContract {
  @ApiPropertyOptional({ enum: TRADE_TYPES })
  @IsOptional()
  @IsEnum(TRADE_TYPES)
  tradeType?: TradeType;

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

  @ApiPropertyOptional({ example: '560001' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  servicePincode?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}
