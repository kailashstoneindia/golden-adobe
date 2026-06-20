import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsEnum, MinLength } from 'class-validator';
import { Role } from '../../../common/enums/role.enum';

export class RegisterDto {
  @ApiProperty({
    example: 'eyJhbGciOi...',
    description: 'Onboarding token received from verify-otp (for new users)',
  })
  @IsString()
  @IsNotEmpty()
  onboardingToken: string;

  @ApiProperty({
    example: 'Rajesh Kumar',
    description: 'Full name of the user',
  })
  @IsString()
  @MinLength(2, { message: 'Name must be at least 2 characters' })
  name: string;

  @ApiProperty({
    enum: [Role.CUSTOMER, Role.VENDOR, Role.ARTISAN],
    example: Role.CUSTOMER,
    description: 'User role — ADMIN cannot be self-selected',
  })
  @IsEnum(Role, { message: 'Role must be CUSTOMER, VENDOR, or ARTISAN' })
  role: Role;
}
