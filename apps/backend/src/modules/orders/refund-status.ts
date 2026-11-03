import { OrderStatus } from './models/order.model';

const REFUNDABLE_STATUSES: ReadonlySet<OrderStatus> = new Set([
  OrderStatus.CONFIRMED,
  OrderStatus.REFUND_REQUIRED,
  OrderStatus.REFUND_PENDING,
  OrderStatus.REFUNDED,
]);

// Decision 0054 rule 6: the order status follows the money movement.
// processed = refunds Razorpay has paid out; open = refunds requested or
// submitted but not yet settled. Partial refunds never reach the thresholds,
// so they leave the status alone.
export function projectOrderStatus(
  current: OrderStatus,
  capturedPaise: number,
  processedPaise: number,
  openPaise: number,
): OrderStatus {
  if (!REFUNDABLE_STATUSES.has(current)) {
    return current;
  }
  if (processedPaise >= capturedPaise) {
    return OrderStatus.REFUNDED;
  }
  if (processedPaise + openPaise >= capturedPaise) {
    return OrderStatus.REFUND_PENDING;
  }
  // The full refund that put the order in refund_pending is gone (failed).
  if (current === OrderStatus.REFUND_PENDING) {
    return OrderStatus.REFUND_REQUIRED;
  }
  return current;
}
