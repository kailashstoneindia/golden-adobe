import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

// Decision 0058 Task 10: an admin pauses or reactivates. out_of_stock is the
// vendor's own call about their stock, so it is not offered here.
export class SetAdminListingStatusDto {
  @ApiProperty({ enum: ['active', 'paused'] })
  @IsIn(['active', 'paused'])
  status!: 'active' | 'paused';
}
