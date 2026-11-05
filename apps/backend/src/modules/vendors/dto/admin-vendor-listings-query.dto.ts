import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

const LISTING_STATUSES = ['active', 'paused', 'out_of_stock'] as const;

// GET /admin/vendors/:id/listings (decision 0058 Task 5).
export class AdminVendorListingsQueryDto {
  @IsOptional()
  @IsIn(LISTING_STATUSES)
  status?: (typeof LISTING_STATUSES)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
