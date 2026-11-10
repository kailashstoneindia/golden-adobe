// Delivery module shared types (decision 0060).

export const DELIVERY_ASSIGNMENT_STATUSES = {
  ASSIGNED: 'assigned',
  PICKED_UP: 'picked_up',
  DELIVERED: 'delivered',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;

export type DeliveryAssignmentStatus =
  (typeof DELIVERY_ASSIGNMENT_STATUSES)[keyof typeof DELIVERY_ASSIGNMENT_STATUSES];

export const DELIVERY_FAILURE_REASONS = [
  'customer_unavailable',
  'site_inaccessible',
  'customer_refused',
  'goods_damaged',
  'other',
] as const;

export type DeliveryFailureReason = (typeof DELIVERY_FAILURE_REASONS)[number];

// Wrong delivery OTPs allowed before the assignment locks and ops must step in.
export const DELIVERY_OTP_MAX_ATTEMPTS = 5;

// Used when real SMS is off (USE_MSG91_SMS !== 'true'), same switch as login.
export const DEMO_DELIVERY_OTP = '123456';

export const DELIVERY_PHOTO_KINDS = ['handover', 'delivered', 'failed'] as const;

export type DeliveryPhotoKind = (typeof DELIVERY_PHOTO_KINDS)[number];

// Frozen copy of the delivery address, written onto the order at checkout so
// a later edit to the saved address cannot redirect a paid-for delivery.
export interface DeliveryAddressSnapshot {
  label: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  pincode: string;
  lat: number | null;
  lng: number | null;
  recipientName: string | null;
  recipientPhone: string | null;
}

export interface VehicleDto {
  id: string;
  registrationNumber: string;
  type: string;
  notes: string | null;
  isActive: boolean;
}

export interface AdminDriverDto {
  id: string;
  userId: string;
  name: string;
  phone: string;
  isActive: boolean;
  licenceNumber: string;
  helperName: string | null;
  helperPhone: string | null;
  vehicle: VehicleDto | null;
  licenceDocViewUrl: string | null;
  aadhaarDocViewUrl: string | null;
}
