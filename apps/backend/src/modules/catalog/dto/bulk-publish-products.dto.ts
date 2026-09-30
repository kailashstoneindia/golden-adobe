import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsOptional, IsUUID } from 'class-validator';

// Exactly one selection mode — productIds OR a category/brand filter, never
// both together (rejected, not silently merged) — with categoryId and
// brandId themselves ANDed when both are given. Enforced in the service,
// not here, matching this module's existing convention of putting semantic
// validation (e.g. setProductStatus's trigger-error translation) at the
// service layer rather than the DTO.
export class BulkPublishProductsDto {
  @ApiPropertyOptional({ description: 'Explicit product IDs to publish.' })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID(undefined, { each: true })
  productIds?: string[];

  @ApiPropertyOptional({
    description: 'Publish every draft product in this category and its subtree.',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Publish every draft product for this brand.' })
  @IsOptional()
  @IsUUID()
  brandId?: string;
}
