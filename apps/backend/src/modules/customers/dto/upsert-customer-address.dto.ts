import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsLatitude, IsLongitude, MinLength } from 'class-validator';

export class UpsertCustomerAddressDto {
  @ApiProperty({ example: 'Home' })
  @IsString()
  @MinLength(1)
  label: string;

  @ApiProperty({ example: 'Flat 4B, Sunrise Apartments' })
  @IsString()
  @MinLength(1)
  addressLine1: string;

  @ApiProperty({ required: false, example: 'Sector 21' })
  @IsOptional()
  @IsString()
  addressLine2?: string;

  @ApiProperty({ example: 'Gurugram' })
  @IsString()
  @MinLength(1)
  city: string;

  @ApiProperty({ example: '122001' })
  @IsString()
  @MinLength(5)
  pincode: string;

  @ApiProperty({ required: false, example: 28.4595 })
  @IsOptional()
  @IsLatitude()
  lat?: number;

  @ApiProperty({ required: false, example: 77.0266 })
  @IsOptional()
  @IsLongitude()
  lng?: number;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
