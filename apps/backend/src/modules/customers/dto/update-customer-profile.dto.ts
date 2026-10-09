import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class UpdateCustomerProfileDto {
  @ApiProperty({ example: 'Priya Sharma' })
  @IsString()
  @MinLength(1)
  fullName: string;
}
