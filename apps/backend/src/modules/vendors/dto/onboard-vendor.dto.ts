import { IsString, IsNumber, IsOptional, Length, IsNotEmpty, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VendorOnboardDto } from '@golden-abode/types';

export class OnboardVendorDto implements VendorOnboardDto {
  @ApiProperty({ example: 'Golden Abode Hardware', description: 'Name of the shop or business' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  shopName: string;

  @ApiProperty({ example: '123 Main Street, Delhi', description: 'Physical address of the shop' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  address: string;

  @ApiProperty({ example: 28.7041, description: 'GPS Latitude' })
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @ApiProperty({ example: 77.1025, description: 'GPS Longitude' })
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;

  @ApiPropertyOptional({ example: 'vendor@okicici', description: 'UPI ID for payouts' })
  @IsString()
  @IsOptional()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  upiId?: string;

  @ApiPropertyOptional({ example: 'HDFC Bank, Acc: 1234567890, IFSC: HDFC0000123', description: 'Bank account details' })
  @IsString()
  @IsOptional()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  bankDetails?: string;

  @ApiPropertyOptional({ example: '22AAAAA0000A1Z5', description: 'GSTIN Number' })
  @IsString()
  @IsOptional()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @Length(15, 15)
  gstin?: string;
}
