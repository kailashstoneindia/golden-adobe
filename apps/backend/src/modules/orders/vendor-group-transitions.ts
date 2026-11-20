import { OrderVendorGroupStatus } from './models/order-vendor-group.model';

// Valid forward transitions a vendor may make, and the single source for the
// vendor-facing update. Decision 0060: vendors only mark goods ready or cancel.
// Shipping and delivery belong to the driver flow, ops re-attempts and the
// admin override, so every later status is empty for a vendor.
// PENDING is unreachable here today (checkout confirms every group), but the
// entry stays so the table never depends on that invariant.
export const VENDOR_GROUP_TRANSITIONS: Record<OrderVendorGroupStatus, OrderVendorGroupStatus[]> = {
  [OrderVendorGroupStatus.PENDING]: [
    OrderVendorGroupStatus.CONFIRMED,
    OrderVendorGroupStatus.CANCELLED,
  ],
  [OrderVendorGroupStatus.CONFIRMED]: [
    OrderVendorGroupStatus.READY_FOR_PICKUP,
    OrderVendorGroupStatus.CANCELLED,
  ],
  [OrderVendorGroupStatus.READY_FOR_PICKUP]: [],
  [OrderVendorGroupStatus.SHIPPED]: [],
  [OrderVendorGroupStatus.DELIVERED]: [],
  [OrderVendorGroupStatus.DELIVERY_FAILED]: [],
  [OrderVendorGroupStatus.CANCELLED]: [],
};
