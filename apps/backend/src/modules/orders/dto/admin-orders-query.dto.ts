import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

// Decision 0058 Task 7: the user popup links to one customer's orders.
export class AdminOrdersQueryDto {
  @ApiPropertyOptional({ description: 'Only this customer’s orders (customers.id)' })
  @IsOptional()
  @IsUUID()
  customerId?: string;
}
