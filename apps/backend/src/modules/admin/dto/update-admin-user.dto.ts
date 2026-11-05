import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// Decision 0058 Task 9: the only user fields an admin may edit. Role,
// approval and ids are not here on purpose (the whitelist rejects them).
export class UpdateAdminUserDto {
  @ApiPropertyOptional({ example: 'Asha Rao' })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: 'asha@example.com', description: 'Stored in lower case' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional({
    example: '+919876543210',
    description: 'Indian mobile with country code. It is the login, so it must be unique.',
  })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @Matches(/^\+91[6-9]\d{9}$/, {
    message: 'Phone must be a valid Indian mobile number (e.g. +919876543210)',
  })
  phone?: string;
}
