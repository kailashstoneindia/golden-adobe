import { IsString, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { DeclineHireRequestDto as DeclineHireRequestContract } from '@golden-abode/types';

// Decision 0055: a decline always carries a reason, same as a cancel, so the
// customer and admin can see why the ustaad said no.
export class DeclineHireRequestDto implements DeclineHireRequestContract {
  @ApiProperty({ example: 'Fully booked for the next two weeks' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  reason: string;
}
