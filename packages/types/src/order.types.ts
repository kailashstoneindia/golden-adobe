export const ORDER_STATUSES = {
  PENDING_PAYMENT: 'pending_payment',
  CONFIRMED: 'confirmed',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded',
} as const;

export type OrderStatus = (typeof ORDER_STATUSES)[keyof typeof ORDER_STATUSES];

export const ORDER_VENDOR_GROUP_STATUSES = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
} as const;

export type OrderVendorGroupStatus =
  (typeof ORDER_VENDOR_GROUP_STATUSES)[keyof typeof ORDER_VENDOR_GROUP_STATUSES];

export const ORDER_VENDOR_GROUP_NEXT_STATUSES: Record<
  OrderVendorGroupStatus,
  OrderVendorGroupStatus[]
> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['shipped', 'cancelled'],
  shipped: ['delivered'],
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

export type OrderDto = {
  id: string;
  customerId: string;
  deliveryAddressId: string;
  grandTotal: number;
  status: OrderStatus;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  createdAt: string;
  updatedAt: string;
  deliveryAddress: CustomerAddressDto | null;
  vendorGroups: OrderVendorGroupDto[];
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
  rawPayload: Record<string, unknown>;
  createdAt: string;
};
