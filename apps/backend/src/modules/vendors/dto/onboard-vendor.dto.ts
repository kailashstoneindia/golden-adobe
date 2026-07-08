import {
  IsString,
  IsNumber,
  IsOptional,
  Length,
  IsNotEmpty,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { VendorAccountDetailsInputDto, VendorOnboardDto } from '@golden-abode/types';

class OnboardVendorAccountDetailsDto implements VendorAccountDetailsInputDto {
  @ApiProperty({ example: 'Tarun Jawla', description: 'Account holder full name' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  accountHolderName: string;

  @ApiProperty({ example: 'HDFC Bank', description: 'Selected bank name' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  bankName: string;

  @ApiProperty({ example: 'HDFC0000123', description: 'IFSC code for the bank branch' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value)
  ifscCode: string;

  @ApiProperty({ example: 'Vaishali Nagar', description: 'Bank branch name' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  branchName: string;

  @ApiProperty({ example: '123456789012', description: 'Bank account number' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  accountNumber: string;
}

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

  @ApiProperty({ type: OnboardVendorAccountDetailsDto, description: 'Structured bank account details' })
  @ValidateNested()
  @Type(() => OnboardVendorAccountDetailsDto)
  accountDetails: OnboardVendorAccountDetailsDto;

  @ApiPropertyOptional({ example: '22AAAAA0000A1Z5', description: 'GSTIN Number' })
  @IsString()
  @IsOptional()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @Length(15, 15)
  gstin?: string;
}
