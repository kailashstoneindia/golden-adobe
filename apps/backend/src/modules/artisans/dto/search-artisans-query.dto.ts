import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { TRADE_TYPES, TradeType } from '@golden-abode/types';

// Customer-facing browse/search (decision 0051 Batch B). Both filters are
// exact-match and optional — omitting both returns every verified
// artisan, newest first. Same 6-digit pincode pattern the catalog search
// module already validates with (search-query.dto.ts), for consistency.
export class SearchArtisansQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ enum: TRADE_TYPES })
  @IsOptional()
  @IsIn(TRADE_TYPES)
  tradeType?: TradeType;

  @ApiPropertyOptional({ example: '560001' })
  @IsOptional()
  @Matches(/^[1-9][0-9]{5}$/, { message: 'pincode must be a 6-digit Indian PIN code' })
  pincode?: string;
}
