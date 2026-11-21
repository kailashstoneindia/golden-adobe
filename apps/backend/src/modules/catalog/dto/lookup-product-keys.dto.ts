import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

// Decision 0063: image file names to products, for the bulk image upload.
export class LookupProductKeysDto {
  @ApiProperty({
    type: [String],
    description: 'Product codes or part numbers (any case), up to 500.',
    example: ['GA-0110919', 'MCB-10'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  keys!: string[];

  @ApiPropertyOptional({
    description:
      'Limit part-number matches to one brand (a part number several brands use is otherwise ambiguous).',
  })
  @IsOptional()
  @IsUUID()
  brandId?: string;
}
