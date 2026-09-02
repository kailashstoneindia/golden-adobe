import {
  IsString,
  IsNumber,
  IsOptional,
  IsNotEmpty,
  Length,
  Min,
  Max,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { UpdateVendorProfileDto as UpdateVendorProfileContract } from '@golden-abode/types';

// Every field optional — PATCH semantics. Account details are deliberately
// NOT here: they live on their own endpoint because
// vendor_account_details.vendorId is unique and the write is an
// update-or-create, which is a different operation from a field patch.
export class UpdateVendorProfileDto implements UpdateVendorProfileContract {
  @ApiPropertyOptional({ example: 'Golden Abode Hardware' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  shopName?: string;

  @ApiPropertyOptional({ example: '123 Main Street, Delhi' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  address?: string;

  // latitude and longitude move together — a lone latitude would shift the
  // vendor's position (and re-resolve their city) against a longitude the
  // caller never intended to keep. ValidateIf makes each required as soon
  // as the other is present.
  @ApiPropertyOptional({ example: 28.7041, description: 'Must be sent together with longitude' })
  @ValidateIf((o) => o.latitude !== undefined || o.longitude !== undefined)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({ example: 77.1025, description: 'Must be sent together with latitude' })
  @ValidateIf((o) => o.latitude !== undefined || o.longitude !== undefined)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiPropertyOptional({ example: 'vendor@okicici' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  upiId?: string;

  @ApiPropertyOptional({ example: 'HDFC Bank, Acc: 1234567890, IFSC: HDFC0000123' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  bankDetails?: string;

  @ApiPropertyOptional({ example: '22AAAAA0000A1Z5' })
  @IsOptional()
  @IsString()
  @Length(15, 15)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  gstin?: string;
}
