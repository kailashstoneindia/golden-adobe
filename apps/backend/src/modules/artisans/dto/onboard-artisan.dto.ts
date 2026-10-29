import { IsEnum, IsInt, IsOptional, IsString, IsNotEmpty, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArtisanOnboardDto as ArtisanOnboardContract, TradeType } from '@golden-abode/types';

const TRADE_TYPES: TradeType[] = [
  'CARPENTER',
  'PLUMBER',
  'PAINTER',
  'ELECTRICIAN',
  'MASON',
  'TILE_LAYING',
  'OTHERS',
];

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
