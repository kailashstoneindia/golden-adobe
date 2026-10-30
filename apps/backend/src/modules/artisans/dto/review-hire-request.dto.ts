import { IsBoolean, IsNotEmpty, IsString, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReviewHireRequestDto as ReviewHireRequestContract } from '@golden-abode/types';

// rejectReason is required only when approve is false — spec §8.1's
// "admin-supplied reason" shown to the customer on rejection.
export class ReviewHireRequestDto implements ReviewHireRequestContract {
  @ApiProperty({ example: true })
  @IsBoolean()
  approve: boolean;

  @ApiPropertyOptional({ example: 'Artisan fully booked this month' })
  @ValidateIf((o) => o.approve === false)
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  rejectReason?: string;
}
