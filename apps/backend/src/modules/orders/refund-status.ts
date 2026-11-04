import { OrderStatus } from './models/order.model';

// An order in any of these has (or had) a captured payment attached, so a
// refund can be requested against it and the projection below applies. The
// pending and refunded ones are let through by the refund request so its
// amount check gives the honest answer: nothing left to refund.
export const REFUNDABLE_ORDER_STATUSES: readonly OrderStatus[] = [
  OrderStatus.CONFIRMED,
  OrderStatus.REFUND_REQUIRED,
  OrderStatus.REFUND_PENDING,
  OrderStatus.REFUNDED,
];

// A vendor or admin override may not advance a vendor group under an order in
// one of these: the money is being, or has been, returned, or the order is
// dead (decision 0054 rule 6).
export const LOCKED_PARENT_ORDER_STATUSES: readonly OrderStatus[] = [
  OrderStatus.REFUNDED,
  OrderStatus.REFUND_PENDING,
  OrderStatus.REFUND_REQUIRED,
  OrderStatus.CANCELLED,
];

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
  if (!REFUNDABLE_ORDER_STATUSES.includes(current)) {
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
