import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

// Same rule as POST /auth/otp/send, because a driver logs in with this number.
const INDIAN_MOBILE = /^\+91[6-9]\d{9}$/;
const PHONE_MESSAGE = 'phone must be an Indian mobile number like +919876543210';

export class CreateDriverDto {
  @ApiProperty({ maxLength: 128 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  name: string;

  @ApiProperty({ example: '+919876543210' })
  @Matches(INDIAN_MOBILE, { message: PHONE_MESSAGE })
  phone: string;

  @ApiProperty({ maxLength: 32 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  licenceNumber: string;

  @ApiPropertyOptional({ maxLength: 128 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  helperName?: string;

  @ApiPropertyOptional({ example: '+919876543210' })
  @IsOptional()
  @Matches(INDIAN_MOBILE, { message: PHONE_MESSAGE })
  helperPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  vehicleId?: string;
}

export class ListDriversQueryDto {
  @ApiPropertyOptional({ description: 'Matches name or phone' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
