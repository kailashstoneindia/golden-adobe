import { IsString, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { CancelHireRequestDto as CancelHireRequestContract } from '@golden-abode/types';

// Reason is always required here, unlike ReviewHireRequestDto's conditional
// rejectReason — spec 0045: every cancellation is logged against a reason,
// regardless of who initiates it (customer, artisan, or admin).
export class CancelHireRequestDto implements CancelHireRequestContract {
  @ApiProperty({ example: 'Customer no longer needs the work done' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  reason: string;
}
