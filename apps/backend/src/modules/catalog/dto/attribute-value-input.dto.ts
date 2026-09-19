import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// One cell's worth of a product's attribute values — the same {code, value}
// shape GET /admin/catalog/products/:id already returns them in, and the
// same "value is always a string" convention master_product_attribute_value
// itself uses (dataType-specific parsing/validation happens against the
// resolved Attribute, not against the DTO).
export class AttributeValueInputDto {
  @ApiProperty({ description: "The attribute's code, e.g. \"current_rating\"." })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty({ description: 'Value as a string, regardless of the attribute\'s data type.' })
  @IsString()
  value!: string;
}
