import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

// Decision 0063. A brand needs the four Legal Metrology fields (decision
// 0010, NOT NULL by 0014) before any of its products can be listed, so all
// of them are required here; there is no "quick add" without them.
export class CreateBrandDto {
  @ApiProperty({ example: 'Havells' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  name!: string;

  @ApiProperty({ example: 'Havells India Ltd' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  manufacturerName!: string;

  @ApiProperty({ example: 'QRG Towers, 2D Sector 126, Noida, UP 201304' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  manufacturerAddress!: string;

  @ApiProperty({ example: 'customercare@havells.com' })
  @Transform(trim)
  @IsEmail()
  @MaxLength(255)
  consumerCareEmail!: string;

  @ApiProperty({ example: '+91 1800 11 0303' })
  @Transform(trim)
  @IsString()
  @Matches(/^\+?[0-9 ()-]{7,20}$/, {
    message:
      'consumerCarePhone must be 7 to 20 digits, spaces, brackets or dashes, optionally starting with +',
  })
  consumerCarePhone!: string;
}
