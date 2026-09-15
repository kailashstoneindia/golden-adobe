import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';
import { AttributeValueInputDto } from './attribute-value-input.dto';

// Correction, not re-classification (decision 0023): category is
// deliberately not editable here. Changing a product's category changes
// its entire effective attribute set (global + inherited + own), which is a
// different operation from fixing a name or an attribute value — that stays
// delete+recreate until a real need for in-place recategorization is argued.
//
// attributeValues, when present, is a full replace of the product's
// attribute rows (matching the PUT-style "whole set" convention already
// used by SetVendorCategoriesDto) — not a merge. Omit the field entirely to
// leave attribute values untouched.
export class UpdateProductDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({
    type: [AttributeValueInputDto],
    description:
      'Full replacement of this product\'s attribute values. Omit to leave existing values ' +
      'untouched; send [] to clear all of them (blocked at publish time if any cleared ' +
      'attribute is variant-defining on a live product).',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttributeValueInputDto)
  attributeValues?: AttributeValueInputDto[];
}
