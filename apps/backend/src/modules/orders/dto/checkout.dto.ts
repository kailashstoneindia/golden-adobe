import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class CheckoutDto {
  @ApiProperty({ example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' })
  @IsUUID()
  deliveryAddressId: string;

  // Decision 0045: attributes this checkout to an artisan hire request
  // (Path B). Validated against ownership and status inside
  // CheckoutService — a bare @IsUUID() here only confirms the shape, not
  // that it's legal to use.
  @ApiPropertyOptional({ example: 'a1b2c3d4-...' })
  @IsOptional()
  @IsUUID()
  bookingId?: string;
}
