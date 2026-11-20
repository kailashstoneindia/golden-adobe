import type { DeliveryAssignmentStatus, DeliveryFailureReason } from '@golden-abode/types';

export const DELIVERY_FAILURE_REASON_LABELS: Record<DeliveryFailureReason, string> = {
  customer_unavailable: 'Customer unavailable',
  site_inaccessible: 'Site inaccessible',
  customer_refused: 'Customer refused',
  goods_damaged: 'Goods damaged',
  other: 'Other',
};

// The board tabs, in the order ops works through them.
export const DELIVERY_BOARD_TABS: { status: DeliveryAssignmentStatus; label: string }[] = [
  { status: 'assigned', label: 'Assigned' },
  { status: 'picked_up', label: 'Picked up' },
  { status: 'failed', label: 'Failed' },
  { status: 'delivered', label: 'Delivered' },
];

export const DELIVERY_ASSIGNMENT_STATUS_LABELS: Record<DeliveryAssignmentStatus, string> = {
  assigned: 'Assigned',
  picked_up: 'Picked up',
  delivered: 'Delivered',
  failed: 'Failed',
  cancelled: 'Cancelled',
};
