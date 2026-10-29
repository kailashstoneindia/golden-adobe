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

  @ApiPropertyOptional({ example: '560001' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  servicePincode?: string;

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
