import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

// Phase 6g (decision 0021, search-system-design.md section 6).
//
// Note what is NOT here: city_id. The server resolves the city from pincode
// and/or coordinates and applies the filter itself — a client-supplied
// city_id would be a trust boundary violation, and a tampered or stale one
// would leak cross-city results, which is exactly what decision 0018 exists
// to prevent.
export class SearchQueryDto {
  @ApiPropertyOptional({ description: 'Free-text query. Omit to browse by filter alone.' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Indian PIN code used to resolve the city.' })
  @IsOptional()
  @Matches(/^[1-9][0-9]{5}$/, { message: 'pincode must be a 6-digit Indian PIN code' })
  pincode?: string;

  @ApiPropertyOptional({ description: 'Latitude. Wins over pincode on disagreement (0019).' })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @ApiPropertyOptional({ description: 'Longitude. Wins over pincode on disagreement (0019).' })
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;

  @ApiPropertyOptional({ description: 'Leaf or ancestor category path; matches the subtree.' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Brand name.' })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional({ description: 'Minimum price of the cheapest listing in the city.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ description: 'Maximum price of the cheapest listing in the city.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({
    description:
      'Attribute filters as repeated key:value pairs, e.g. attr=rated_current:32&attr=tripping_curve:C',
    type: [String],
  })
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsString({ each: true })
  attr?: string[];

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class AdminSearchQueryDto {
  @ApiPropertyOptional({ description: 'Free-text name query, or an exact product code.' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional({
    description:
      'Product status. Admin search exists specifically to reach drafts, which have no listing and therefore no search document (0019).',
    enum: ['draft', 'pending_review', 'live', 'deprecated'],
  })
  @IsOptional()
  @IsString()
  status?: 'draft' | 'pending_review' | 'live' | 'deprecated';

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

// Parses `attr=key:value` pairs into the object shape both engines filter on.
// A pair with no colon, or an empty key, is dropped rather than throwing —
// a malformed filter should narrow nothing, not fail the whole search.
export function parseAttrPairs(attr?: string[]): Record<string, string> {
  if (!attr || attr.length === 0) return {};
  const out: Record<string, string> = {};
  for (const raw of attr) {
    const idx = raw.indexOf(':');
    if (idx <= 0) continue;
    const key = raw.slice(0, idx).trim();
    const value = raw.slice(idx + 1).trim();
    if (key && value) out[key] = value;
  }
  return out;
}
