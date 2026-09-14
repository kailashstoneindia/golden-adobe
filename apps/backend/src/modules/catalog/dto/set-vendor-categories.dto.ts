import { IsArray, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// PUT-style full replace: the body is the complete set the vendor should
// end up registered for, not a delta. Fits the composite-PK join table
// better than add/remove endpoints, and makes "unregister everything" a
// plain empty array rather than a special case.
//
// NOT @ArrayNotEmpty — an empty array is the legitimate way to clear a
// vendor's registrations. Note that under the Option A export fallback,
// clearing them currently widens export scope rather than narrowing it
// (see VendorCategoriesService.assertExportScopeAllowed).
export class SetVendorCategoriesDto {
  @ApiProperty({
    type: [String],
    description: 'Complete set of LEAF category IDs this vendor is registered for. Replaces the existing set.',
    example: [],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  categoryIds!: string[];
}
