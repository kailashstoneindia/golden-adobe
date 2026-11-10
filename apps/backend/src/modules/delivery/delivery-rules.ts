import { BadRequestException } from '@nestjs/common';
import { GROUP_LOCKED_MESSAGE, LOCKED_PARENT_ORDER_STATUSES } from '../orders/refund-status';
import { OrderStatus } from '../orders/models/order.model';

// Every driver or ops transition is refused once the money is being returned
// or the order is dead (decision 0060, State machine).
export function assertParentNotLocked(orderStatus: OrderStatus): void {
  if (LOCKED_PARENT_ORDER_STATUSES.includes(orderStatus)) {
    throw new BadRequestException(GROUP_LOCKED_MESSAGE);
  }
}
