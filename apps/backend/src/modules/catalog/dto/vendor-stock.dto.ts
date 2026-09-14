import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import { VendorListingStatus } from '../models/vendor-listing.model';

// quantity_available is DECIMAL(12,3), not an integer — a vendor sells
// sand by the tonne and tiles by the box, and the unit of measure is the
// category's, not this column's. So fractional quantities are legitimate
// and @IsInt would be wrong here.
//
// maxDecimalPlaces mirrors the column's scale of 3: a value with more
// precision than the column can store would otherwise be silently rounded
// on write, and the vendor would read back a number they did not type.
const QUANTITY_CONSTRAINTS = { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 3 };

// 12 digits total, 3 after the point, so the largest storable value is
// 999999999.999. Rejecting above that at the DTO turns an opaque Postgres
// "numeric field overflow" into a message naming the limit.
const MAX_QUANTITY = 999999999.999;

export class SetStockDto {
  @ApiProperty({
    description:
      'Absolute quantity on hand, NOT a delta. Fractional values are allowed — the unit is the category unit of measure (tonnes, boxes, sqft). Setting 0 means "none left"; it does not change the listing status.',
    example: 25,
    minimum: 0,
    maximum: MAX_QUANTITY,
  })
  @IsNumber(QUANTITY_CONSTRAINTS)
  @Min(0)
  @Max(MAX_QUANTITY)
  quantityAvailable!: number;
}

export class SetListingStatusDto {
  @ApiProperty({
    enum: VendorListingStatus,
    description:
      'Listing availability. Independent of stock — setting this never changes quantity_available, and a status of "active" with zero stock is a legal state you are free to leave in place.',
    example: VendorListingStatus.PAUSED,
  })
  @IsIn(Object.values(VendorListingStatus))
  status!: VendorListingStatus;
}

export class BulkStockItemDto {
  @ApiProperty({ description: 'A vendor_listing id belonging to YOU.' })
  @IsUUID()
  vendorListingId!: string;

  @ApiProperty({
    description: 'Absolute quantity for that listing.',
    example: 40,
    minimum: 0,
    maximum: MAX_QUANTITY,
  })
  @IsNumber(QUANTITY_CONSTRAINTS)
  @Min(0)
  @Max(MAX_QUANTITY)
  quantityAvailable!: number;
}

// All-or-nothing: one unknown or unowned id rejects the entire batch with
// a 400 naming the offending ids, and nothing is written. The alternative
// (partial success with a failures[] report) leaves the vendor in a
// half-applied state they then have to reconcile by hand, and this
// codebase has already chosen loud rejection over silent partial success
// for export scoping (VendorCategoriesService.assertExportScopeAllowed).
//
// The 500-item cap is not arbitrary: the whole batch becomes one SQL
// statement, so the cap bounds both the statement size and the size of a
// single transaction's lock footprint.
export class BulkSetStockDto {
  @ApiProperty({
    type: [BulkStockItemDto],
    description:
      'Up to 500 listings to update in one transaction. If ANY id is unknown or not yours, the whole batch is rejected and nothing is written.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => BulkStockItemDto)
  items!: BulkStockItemDto[];
}

export class ListVendorListingsQueryDto {
  @ApiPropertyOptional({
    enum: VendorListingStatus,
    description: 'Show only listings in this status.',
  })
  @IsOptional()
  @IsIn(Object.values(VendorListingStatus))
  status?: VendorListingStatus;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 25, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
