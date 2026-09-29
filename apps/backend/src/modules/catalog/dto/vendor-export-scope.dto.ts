import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsDateString, IsOptional, IsString, ArrayNotEmpty } from 'class-validator';

// Export scoping is not optional in v1 (decision 0011) — leafCategoryIds is
// required, never defaults to "everything registered".
export class VendorExportScopeDto {
  @ApiProperty({ type: [String], description: 'Leaf category IDs to export' })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  leafCategoryIds!: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  brandIds?: string[];

  @ApiPropertyOptional({ description: 'Only products created on/after this date' })
  @IsOptional()
  @IsDateString()
  sinceDate?: string;
}
