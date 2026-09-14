import { IsString, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { VendorAccountDetailsInputDto } from '@golden-abode/types';

// All fields required, not a partial patch: vendor_account_details is a
// single unique row per vendor and a half-updated bank record is a payout
// failure. The caller sends the complete set every time.
export class UpdateAccountDetailsDto implements VendorAccountDetailsInputDto {
  @ApiProperty({ example: 'Tarun Jawla' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  accountHolderName: string;

  @ApiProperty({ example: 'HDFC Bank' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  bankName: string;

  @ApiProperty({ example: 'HDFC0000123' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  ifscCode: string;

  @ApiProperty({ example: 'Vaishali Nagar' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  branchName: string;

  @ApiProperty({ example: '123456789012' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  accountNumber: string;
}
