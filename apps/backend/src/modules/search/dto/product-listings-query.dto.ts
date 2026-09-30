import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude, IsOptional, Matches } from 'class-validator';

// Same city-resolution inputs as SearchQueryDto, same reasoning: no city_id
// here either — the server resolves it, never the client (0018/0019).
export class ProductListingsQueryDto {
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
}
