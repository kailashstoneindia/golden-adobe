import type { OrderStatus, OrderVendorGroupStatus } from '@golden-abode/types';
import { ORDER_STATUSES, ORDER_VENDOR_GROUP_STATUSES } from '@golden-abode/types';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  [ORDER_STATUSES.PENDING_PAYMENT]: 'Pending payment',
  [ORDER_STATUSES.CONFIRMED]: 'Confirmed',
  [ORDER_STATUSES.CANCELLED]: 'Cancelled',
  [ORDER_STATUSES.REFUNDED]: 'Refunded',
};

export const VENDOR_GROUP_STATUS_LABELS: Record<OrderVendorGroupStatus, string> = {
  [ORDER_VENDOR_GROUP_STATUSES.PENDING]: 'Pending',
  [ORDER_VENDOR_GROUP_STATUSES.CONFIRMED]: 'Confirmed',
  [ORDER_VENDOR_GROUP_STATUSES.SHIPPED]: 'Shipped',
  [ORDER_VENDOR_GROUP_STATUSES.DELIVERED]: 'Delivered',
  [ORDER_VENDOR_GROUP_STATUSES.CANCELLED]: 'Cancelled',
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
  ORDER_VENDOR_GROUP_STATUSES.SHIPPED,
  ORDER_VENDOR_GROUP_STATUSES.DELIVERED,
];
