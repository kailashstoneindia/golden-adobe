import { IsUUID, ValidateIf } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// The admin override (decision 0019: auto-suggest from GPS, "admin free to
// override"). Explicit null is allowed and meaningful — it clears the
// override and lets the next address change re-resolve the city from
// coordinates. ValidateIf skips the UUID check only for null, so a missing
// key or a malformed string is still rejected.
export class SetVendorCityDto {
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'City to pin this vendor to. Null clears the override and re-enables GPS auto-resolution.',
  })
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  cityId!: string | null;
}
