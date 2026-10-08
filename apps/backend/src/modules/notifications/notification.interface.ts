export const NOTIFICATION_SERVICE = 'NOTIFICATION_SERVICE';

// Decision 0033 rule 9. Called from the order status machine regardless of
// whether a real push provider is configured, so the call sites are
// exercised and correct before the first real notification is ever sent.
export interface NotificationService {
  sendOrderPlaced(customerId: string, orderId: string): Promise<void>;
  sendOrderStatusChanged(customerId: string, orderId: string, status: string): Promise<void>;
  // Fired once per order_vendor_group, to that group's vendor only, right
  // after payment is confirmed. A vendor is told about their own group's
  // items and subtotal — never the parent order's total or the other
  // vendor(s) sharing the same cart/payment. This answers "how does each
  // vendor find out they have an order" for a multi-vendor checkout —
  // there is otherwise no path from a multi-vendor checkout to any
  // individual vendor knowing a group landed in their queue.
  sendNewOrderToVendor(vendorId: string, orderVendorGroupId: string): Promise<void>;
}
