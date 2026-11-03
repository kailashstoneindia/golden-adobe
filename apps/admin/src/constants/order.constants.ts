import type { OrderStatus, OrderVendorGroupStatus, RefundStatus } from '@golden-abode/types';
import { ORDER_STATUSES, ORDER_VENDOR_GROUP_STATUSES } from '@golden-abode/types';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  [ORDER_STATUSES.PENDING_PAYMENT]: 'Pending payment',
  [ORDER_STATUSES.CONFIRMED]: 'Confirmed',
  [ORDER_STATUSES.CANCELLED]: 'Cancelled',
  [ORDER_STATUSES.REFUND_REQUIRED]: 'Refund required',
  [ORDER_STATUSES.REFUND_PENDING]: 'Refund in progress',
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

export const REFUND_STATUS_LABELS: Record<RefundStatus, string> = {
  requested: 'Requested',
  submitted: 'Submitted',
  processed: 'Processed',
  failed: 'Failed',
};

// Mirrors the backend's AdminRefundRequest validation.
export const REFUND_REASON_MIN_LENGTH = 3;
export const REFUND_REASON_MAX_LENGTH = 500;
export const REFUND_MIN_AMOUNT_PAISE = 100;

export const ORDER_STATUS_FILTERS = {
  ALL: 'all',
  NEEDS_REFUND: 'needs_refund',
  REFUND_IN_PROGRESS: 'refund_in_progress',
} as const;

export type OrderStatusFilter = (typeof ORDER_STATUS_FILTERS)[keyof typeof ORDER_STATUS_FILTERS];

export const ORDER_STATUS_FILTER_OPTIONS: { value: OrderStatusFilter; label: string }[] = [
  { value: ORDER_STATUS_FILTERS.ALL, label: 'All' },
  { value: ORDER_STATUS_FILTERS.NEEDS_REFUND, label: 'Needs refund' },
  { value: ORDER_STATUS_FILTERS.REFUND_IN_PROGRESS, label: 'Refund in progress' },
];
