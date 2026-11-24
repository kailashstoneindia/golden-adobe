import type { OrderStatus, OrderVendorGroupStatus } from '@golden-abode/types';
import { ORDER_STATUSES, ORDER_VENDOR_GROUP_STATUSES } from '@golden-abode/types';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  [ORDER_STATUSES.PENDING_PAYMENT]: 'Pending payment',
  [ORDER_STATUSES.CONFIRMED]: 'Confirmed',
  [ORDER_STATUSES.CANCELLED]: 'Cancelled',
  [ORDER_STATUSES.REFUND_REQUIRED]: 'Refund in progress',
  [ORDER_STATUSES.REFUND_PENDING]: 'Refund in progress',
  [ORDER_STATUSES.REFUNDED]: 'Refunded',
};

export const VENDOR_GROUP_STATUS_LABELS: Record<OrderVendorGroupStatus, string> = {
  [ORDER_VENDOR_GROUP_STATUSES.PENDING]: 'Pending',
  [ORDER_VENDOR_GROUP_STATUSES.CONFIRMED]: 'Confirmed',
  [ORDER_VENDOR_GROUP_STATUSES.READY_FOR_PICKUP]: 'Packed',
  [ORDER_VENDOR_GROUP_STATUSES.DELIVERY_FAILED]: 'Delivery attempt failed',
  [ORDER_VENDOR_GROUP_STATUSES.SHIPPED]: 'Out for delivery',
  [ORDER_VENDOR_GROUP_STATUSES.DELIVERED]: 'Delivered',
  [ORDER_VENDOR_GROUP_STATUSES.CANCELLED]: 'Cancelled',
};

// Customer-facing wording (delivery guide section 7).
export const CUSTOMER_GROUP_STATUS_LABELS: Record<OrderVendorGroupStatus, string> = {
  [ORDER_VENDOR_GROUP_STATUSES.PENDING]: 'Awaiting confirmation',
  [ORDER_VENDOR_GROUP_STATUSES.CONFIRMED]: 'Order confirmed',
  [ORDER_VENDOR_GROUP_STATUSES.READY_FOR_PICKUP]: 'Packed',
  [ORDER_VENDOR_GROUP_STATUSES.SHIPPED]: 'Out for delivery',
  [ORDER_VENDOR_GROUP_STATUSES.DELIVERED]: 'Delivered',
  [ORDER_VENDOR_GROUP_STATUSES.DELIVERY_FAILED]: 'Delivery attempt failed (we will contact you)',
  [ORDER_VENDOR_GROUP_STATUSES.CANCELLED]: 'Cancelled',
};

// Button text for the vendor's allowed moves, named for the action rather
// than the status it leads to.
export const VENDOR_GROUP_ACTION_LABELS: Partial<Record<OrderVendorGroupStatus, string>> = {
  [ORDER_VENDOR_GROUP_STATUSES.CONFIRMED]: 'Confirm order',
  [ORDER_VENDOR_GROUP_STATUSES.READY_FOR_PICKUP]: 'Packed & ready',
  [ORDER_VENDOR_GROUP_STATUSES.CANCELLED]: 'Cancel order',
};

export const CART_LINE_WARNINGS = {
  paint: 'Paint cannot be checked out',
  noStock: 'No stock on record — remove this item to check out',
  outOfStock: 'Out of stock — remove this item to check out',
} as const;

export const PRICE_SUMMARY_LABELS = {
  subtotal: 'Subtotal',
  tax: 'Tax',
  discount: 'Discount',
  total: 'Total',
  notApplied: 'Not applied',
} as const;

export const VENDOR_GROUP_STATUS_STEPS: OrderVendorGroupStatus[] = [
  ORDER_VENDOR_GROUP_STATUSES.PENDING,
  ORDER_VENDOR_GROUP_STATUSES.CONFIRMED,
  ORDER_VENDOR_GROUP_STATUSES.READY_FOR_PICKUP,
  ORDER_VENDOR_GROUP_STATUSES.SHIPPED,
  ORDER_VENDOR_GROUP_STATUSES.DELIVERED,
];
