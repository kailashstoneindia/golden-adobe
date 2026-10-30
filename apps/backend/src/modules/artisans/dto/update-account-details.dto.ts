import { IsString, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ArtisanAccountDetailsInputDto } from '@golden-abode/types';

// All fields required, not a partial patch — same rationale as the
// vendor equivalent: artisan_account_details is a single unique row per
// artisan (full replace), and a half-updated bank record is a payout
// failure waiting to happen. The caller sends the complete set every time.
export class UpdateAccountDetailsDto implements ArtisanAccountDetailsInputDto {
  @ApiProperty({ example: 'Ramesh Kumar' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  accountHolderName: string;

  @ApiProperty({ example: 'SBI' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  bankName: string;

  @ApiProperty({ example: 'SBIN0001234' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  ifscCode: string;

  @ApiProperty({ example: 'Koramangala' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  branchName: string;

  @ApiProperty({ example: '1234567890' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  accountNumber: string;
}
