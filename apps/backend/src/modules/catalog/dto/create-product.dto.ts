import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { AttributeValueInputDto } from './attribute-value-input.dto';

// Single-product create — the counterpart to the bulk Excel importer for
// one-off corrections and additions (decision 0023). Deliberately narrower
// than a spreadsheet row: brand is optional (many rows are unbranded
// generics, same as the importer), and there is no dedup pre-check here —
// the DB's own brand+MPN / category+identity_hash constraints are the
// backstop, translated to a 400 the same way AdminCatalogService.setProductStatus
// already does for the publish trigger (see AdminCatalogService.createProduct).
export class CreateProductDto {
  @ApiProperty({ description: 'Must be a LEAF category — products cannot attach to a group.' })
  @IsUUID()
  categoryId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional({ description: 'Brand name. Must already exist — this endpoint does not create brands.' })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mfrPartNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gtin?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  hsnCode?: string;

  @ApiPropertyOptional({ default: 18.0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  gstRate?: number;

  @ApiPropertyOptional({ default: 'India' })
  @IsOptional()
  @IsString()
  countryOfOrigin?: string;

  @ApiPropertyOptional({
    type: [AttributeValueInputDto],
    description:
      "The category's effective attributes (see GET /admin/catalog/categories/:id/attributes). " +
      'Variant-defining attributes are enforced at publish time, not at create time — a draft ' +
      'may be created with them blank and filled in before publishing.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttributeValueInputDto)
  attributeValues?: AttributeValueInputDto[];
}
