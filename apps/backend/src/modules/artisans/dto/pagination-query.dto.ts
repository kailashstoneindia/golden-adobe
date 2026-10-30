import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ArtisanHireRequestStatus, HIRE_REQUEST_STATUSES } from '@golden-abode/types';

// Same page/limit shape and defaults as ListUsersQueryDto — these admin
// artisan list endpoints have no other filters beyond the optional status
// filter below.
export class PaginationQueryDto {
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

  // GET /admin/artisans/hire-requests only — ignored by every other
  // endpoint that reuses this DTO (they already scope status themselves,
  // e.g. hire-requests/pending is always PENDING_ADMIN_REVIEW).
  @ApiPropertyOptional({ enum: HIRE_REQUEST_STATUSES })
  @IsOptional()
  @IsIn(HIRE_REQUEST_STATUSES)
  status?: ArtisanHireRequestStatus;
}
