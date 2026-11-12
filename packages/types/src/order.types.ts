export const ORDER_STATUSES = {
  PENDING_PAYMENT: 'pending_payment',
  CONFIRMED: 'confirmed',
  CANCELLED: 'cancelled',
  REFUND_REQUIRED: 'refund_required',
  REFUND_PENDING: 'refund_pending',
  REFUNDED: 'refunded',
} as const;

export type OrderStatus = (typeof ORDER_STATUSES)[keyof typeof ORDER_STATUSES];

// How long an unpaid order holds its stock (decision 0054). The backend's
// stale-reservation sweep and Razorpay's per-payment capture window both use
// it, and the mobile app closes the Checkout sheet before it runs out, so
// all three share this one number.
export const PAYMENT_HOLD_MINUTES = 20;

export const ORDER_VENDOR_GROUP_STATUSES = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  READY_FOR_PICKUP: 'ready_for_pickup',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  DELIVERY_FAILED: 'delivery_failed',
  CANCELLED: 'cancelled',
} as const;

export type OrderVendorGroupStatus =
  (typeof ORDER_VENDOR_GROUP_STATUSES)[keyof typeof ORDER_VENDOR_GROUP_STATUSES];

export const ORDER_VENDOR_GROUP_NEXT_STATUSES: Record<
  OrderVendorGroupStatus,
  OrderVendorGroupStatus[]
> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['ready_for_pickup', 'cancelled'],
  ready_for_pickup: ['shipped', 'cancelled'],
  shipped: ['delivered', 'delivery_failed'],
  delivery_failed: ['shipped', 'cancelled'],
  delivered: [],
  cancelled: [],
};

export type CartListingStatus = 'active' | 'paused' | 'out_of_stock';

export type CartItemDto = {
  id: string;
  quantity: number;
  vendorListingId: string;
  vendorId: string;
  shopName: string;
  masterProductId: string;
  productName: string;
  productCode: string;
  price: number;
  mrp: number | null;
  status: CartListingStatus;
  minOrderValue: number | null;
  quantityAvailable: number | null;
  isPaint: boolean;
};

export type CartDto = {
  id: string;
  items: CartItemDto[];
};

export type AddCartItemRequest = {
  vendorListingId: string;
  quantity: number;
};

export type UpdateCartItemRequest = {
  quantity: number;
};

export type CustomerAddressDto = {
  id: string;
  customerId: string;
  label: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  pincode: string;
  lat: number | null;
  lng: number | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type UpsertCustomerAddressRequest = {
  label: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  pincode: string;
  lat?: number;
  lng?: number;
  isDefault?: boolean;
};

export type CheckoutRequest = {
  deliveryAddressId: string;
  // Decision 0045: attributes the resulting order to this hire request
  // (Path B). Omitted or undefined for a direct order (Path A).
  bookingId?: string;
};

export type OrderItemDto = {
  id: string;
  vendorListingId: string;
  masterProductId: string;
  productName: string;
  productCode: string;
  quantity: number;
  unitPriceSnapshot: number;
};

export type OrderVendorGroupDto = {
  id: string;
  orderId: string;
  vendorId: string;
  shopName: string;
  subtotal: number;
  loadingUnloadingFee: number;
  status: OrderVendorGroupStatus;
  items: OrderItemDto[];
};

export type VendorOrderGroupDto = OrderVendorGroupDto;

// Decision 0060 rule 5: only the customer sees the delivery code, and only
// while the group is out for delivery. The vendor, admin and artisan views
// use OrderVendorGroupDto, which has no such field.
export type CustomerOrderVendorGroupDto = OrderVendorGroupDto & {
  deliveryOtp: string | null;
};

// Artisan-facing delivery address — built by explicit field listing, never
// by spreading CustomerAddressDto and deleting keys, same discipline
// ArtisanPublicProfileDto's own comment documents for the same reason: a
// future field added to CustomerAddressDto must not leak into this view by
// default. Keeps enough for the artisan to find the job site
// (addressLine1/2, city, pincode) without the customer's precise GPS
// coordinates or internal ids.
export type ArtisanOrderAddressDto = {
  label: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  pincode: string;
};

// What an artisan may see of an order attributed to their own hire request
// (decision 0051/0052's order-detail fix, tightened after a code review
// caught the original implementation leaking the customer's full address,
// GPS, and customerId by reusing OrderDto's customer-facing shape
// unmodified). No customerId, no razorpay payment internals, no precise
// lat/lng — only what an artisan doing the job plausibly needs: status,
// what was ordered, and where to deliver.
export type ArtisanOrderDto = {
  id: string;
  grandTotal: number;
  status: OrderStatus;
  bookingId: string | null;
  createdAt: string;
  updatedAt: string;
  deliveryAddress: ArtisanOrderAddressDto | null;
  vendorGroups: OrderVendorGroupDto[];
};

export type OrderDto = {
  id: string;
  customerId: string;
  deliveryAddressId: string;
  grandTotal: number;
  // Decision 0054: what Razorpay actually captured, in paise. Differs from
  // grandTotal for a mismatched late payment; null for orders captured
  // before the column existed.
  capturedPaise: number | null;
  status: OrderStatus;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  // Decision 0045: set when this order was placed against an artisan hire
  // request (Path B); null for a direct order (Path A).
  bookingId: string | null;
  createdAt: string;
  updatedAt: string;
  deliveryAddress: CustomerAddressDto | null;
  vendorGroups: CustomerOrderVendorGroupDto[];
};

export type UpdateVendorOrderGroupStatusRequest = {
  status: OrderVendorGroupStatus;
};

export type AdminOverrideVendorGroupStatusRequest = {
  status: OrderVendorGroupStatus;
  reason: string;
};

export type PaymentEventDto = {
  id: string;
  orderId: string;
  eventType: string;
  // Razorpay's x-razorpay-event-id; null for events without one.
  eventId: string | null;
  rawPayload: Record<string, unknown>;
  createdAt: string;
};

export type RefundStatus = 'requested' | 'submitted' | 'processed' | 'failed';

export type RefundRail = 'razorpay' | 'manual_payout';

export type RefundDto = {
  id: string;
  orderId: string;
  orderVendorGroupId: string | null;
  rail: RefundRail;
  amountPaise: number;
  receipt: string;
  razorpayRefundId: string | null;
  status: RefundStatus;
  reason: string;
  createdBy: string;
  createdAt: string;
};

export type AdminRefundRequest = {
  reason: string;
  amountPaise?: number;
  vendorGroupId?: string;
};
