import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AdminResetPasswordDto {
  @ApiProperty({ example: 'admin@kailashstones.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'NewStrongPass123' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword: string;

  @ApiProperty({ description: 'Shared secret required to create or reset an admin account' })
  @IsString()
  @MinLength(8)
  secretKey: string;
}
