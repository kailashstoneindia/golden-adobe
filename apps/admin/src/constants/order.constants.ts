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

export const VENDOR_GROUP_STATUS_OPTIONS = Object.values(ORDER_VENDOR_GROUP_STATUSES);
