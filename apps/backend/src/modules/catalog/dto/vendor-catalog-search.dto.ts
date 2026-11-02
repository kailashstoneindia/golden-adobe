import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

// Decision 0053 — vendor-facing catalog search. Unlike
// ListProductsQueryDto (admin), there is no `status` filter: this always
// returns status = 'live' only, since a vendor should never be able to
// list against a draft/pending_review/deprecated product.
export class VendorCatalogSearchQueryDto {
  @ApiPropertyOptional({ description: 'Free-text name search, or an exact product code.' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Restrict to one leaf category.' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 25, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
