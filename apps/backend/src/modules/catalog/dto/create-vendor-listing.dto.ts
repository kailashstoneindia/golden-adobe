import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

import { MAX_QUANTITY, QUANTITY_CONSTRAINTS } from './vendor-stock.dto';

// price/mrp have no shared constant elsewhere in this module yet — DECIMAL(12,2),
// so 2 decimal places, same reasoning as QUANTITY_CONSTRAINTS (imported
// above) but for money instead of quantity.
const DECIMAL_2_CONSTRAINTS = { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 };
const MAX_MONEY = 9999999999.99;

export class CreateVendorListingDto {
  @ApiProperty({ description: 'An existing, live master_product id to list against.' })
  @IsUUID()
  masterProductId!: string;

  @ApiProperty({
    description: 'Your price for this listing. Untinted price for paint (decision 0007).',
    example: 499.0,
    minimum: 0,
    maximum: MAX_MONEY,
  })
  @IsNumber(DECIMAL_2_CONSTRAINTS)
  @Min(0)
  @Max(MAX_MONEY)
  price!: number;

  @ApiPropertyOptional({ minimum: 0, maximum: MAX_MONEY })
  @IsOptional()
  @IsNumber(DECIMAL_2_CONSTRAINTS)
  @Min(0)
  @Max(MAX_MONEY)
  mrp?: number;

  @ApiPropertyOptional({ default: 1, minimum: 0 })
  @IsOptional()
  @IsNumber(QUANTITY_CONSTRAINTS)
  @Min(0)
  @Max(MAX_QUANTITY)
  minOrderQty?: number;

  @ApiPropertyOptional({ description: 'Your own grade label, e.g. for stone (decision 0009).' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  statedGrade?: string;

  @ApiPropertyOptional({ description: 'Your own SKU for this product.' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  vendorSku?: string;

  @ApiPropertyOptional({
    description:
      'Set your starting stock in the same call. Omit for paint (tinted-to-order carries no inventory row — decision 0007).',
    minimum: 0,
    maximum: MAX_QUANTITY,
  })
  @IsOptional()
  @IsNumber(QUANTITY_CONSTRAINTS)
  @Min(0)
  @Max(MAX_QUANTITY)
  initialQuantityAvailable?: number;
}
