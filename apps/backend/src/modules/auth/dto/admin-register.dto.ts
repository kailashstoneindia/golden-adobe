import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AdminRegisterDto {
  @ApiProperty({ example: 'Super Admin' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'admin@kailashstones.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'StrongPass123' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @ApiProperty({ description: 'Shared secret required to create an admin account' })
  @IsString()
  @MinLength(8)
  secretKey: string;
}
