import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const HSN_PATTERN = /^\d{4,8}$/;
const HSN_MESSAGE = 'HSN code must be 4 to 8 digits';

// Decision 0063: the client's accountant supplies real codes; none are
// pre-loaded.
export class CreateHsnCodeDto {
  @ApiProperty({ example: '69072100' })
  @Transform(trim)
  @IsString()
  @Matches(HSN_PATTERN, { message: HSN_MESSAGE })
  code!: string;

  @ApiProperty({ example: 'Glazed ceramic tiles' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  description!: string;

  @ApiProperty({ minimum: 0, maximum: 100, example: 18 })
  @IsNumber()
  @Min(0)
  @Max(100)
  gstRate!: number;
}

export class ListHsnCodesQueryDto {
  @ApiProperty({ required: false, description: 'Code prefix or part of the description.' })
  @IsOptional()
  @IsString()
  search?: string;
}

export class SetCategoryHsnDefaultDto {
  @ApiProperty({ nullable: true, example: '69072100', description: 'null clears the default.' })
  // Required, but may be null.
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @Matches(HSN_PATTERN, { message: HSN_MESSAGE })
  hsnCodeDefault!: string | null;
}
