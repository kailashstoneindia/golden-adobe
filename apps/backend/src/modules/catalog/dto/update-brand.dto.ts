import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsString, MaxLength, MinLength } from 'class-validator';

import { CreateBrandDto } from './create-brand.dto';

// Any subset of the create fields. The slug never changes (links keep
// working) and the active flag has its own endpoint.
export class UpdateBrandDto extends PartialType(CreateBrandDto) {}

export class SetBrandActiveDto {
  @ApiProperty()
  @IsBoolean()
  isActive!: boolean;
}

export class AddBrandAliasDto {
  @ApiProperty({
    example: 'Havells India Ltd',
    description: 'Another spelling that should mean this brand.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  // brand_alias.alias is STRING(160).
  @MaxLength(160)
  alias!: string;
}
