import type { DeliveryAssignmentStatus, DeliveryFailureReason } from '@golden-abode/types';

// Driver job (assignment) statuses, decision 0060. Not the order group status.
export const DELIVERY_JOB_STATUS_LABELS: Record<DeliveryAssignmentStatus, string> = {
  assigned: 'To pick up',
  picked_up: 'Out for delivery',
  delivered: 'Delivered',
  failed: 'Not delivered',
  cancelled: 'Cancelled',
};

export const DELIVERY_FAILURE_REASON_LABELS: Record<DeliveryFailureReason, string> = {
  customer_unavailable: 'Customer unavailable',
  site_inaccessible: 'Site inaccessible',
  customer_refused: 'Customer refused',
  goods_damaged: 'Goods damaged',
  other: 'Other',
};

export const DRIVER_JOB_SCOPES = ['active', 'history'] as const;
export type DriverJobScope = (typeof DRIVER_JOB_SCOPES)[number];

export const DELIVERY_CONSTANTS = {
  otpLength: 6,
  failureNoteMaxLength: 500,
} as const;
