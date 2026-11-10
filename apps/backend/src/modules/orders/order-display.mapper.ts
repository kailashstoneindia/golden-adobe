import type {
  ArtisanOrderAddressDto,
  ArtisanOrderDto,
  CustomerAddressDto,
  OrderDto,
  OrderItemDto,
  OrderStatus,
  OrderVendorGroupDto,
  OrderVendorGroupStatus,
  PaymentEventDto,
  RefundDto,
} from '@golden-abode/types';
import { Order } from './models/order.model';
import { OrderVendorGroup } from './models/order-vendor-group.model';
import { OrderItem } from './models/order-item.model';
import { PaymentEvent } from './models/payment-event.model';
import { Refund } from './models/refund.model';
import { CustomerAddress } from '../customers/models/customer-address.model';
import { toCustomerAddressDto } from '../customers/customer-address.mapper';
import { snapshotToAddressDto } from './delivery-address-snapshot';
import { toFiniteNumber, toIsoDate } from '../../common/utils/display-number.util';

export function toOrderDto(order: Order, includeDeliveryAddress: boolean): OrderDto {
  return {
    ...toOrderFields(order, includeDeliveryAddress),
    vendorGroups: (order.vendorGroups ?? []).map(toOrderVendorGroupDto),
  };
}

// Everything on OrderDto except the vendor groups, so the admin mapper can
// build its own richer groups without mapping them twice.
export function toOrderFields(
  order: Order,
  includeDeliveryAddress: boolean,
): Omit<OrderDto, 'vendorGroups'> {
  return {
    id: order.id,
    customerId: order.customerId,
    deliveryAddressId: order.deliveryAddressId,
    grandTotal: toFiniteNumber(order.grandTotal),
    capturedPaise: order.capturedPaise ?? null,
    status: order.status as OrderStatus,
    razorpayOrderId: order.razorpayOrderId,
    razorpayPaymentId: order.razorpayPaymentId,
    bookingId: order.bookingId,
    createdAt: toIsoDate(order.createdAt),
    updatedAt: toIsoDate(order.updatedAt),
    deliveryAddress: includeDeliveryAddress ? toOrderAddressDto(order) : null,
  };
}

// Decision 0060: prefer the address frozen at checkout; orders placed before
// the snapshot existed fall back to the live saved-address row.
function toOrderAddressDto(order: Order): CustomerAddressDto | null {
  if (order.deliveryAddressSnapshot) {
    return snapshotToAddressDto(order.deliveryAddressSnapshot, order, toIsoDate(order.createdAt));
  }
  return order.deliveryAddress ? toCustomerAddressDto(order.deliveryAddress) : null;
}

// Artisan-facing order view (decision 0051/0052, tightened after code
// review flagged toOrderDto's customerId/razorpay/precise-GPS fields
// leaking to an artisan with no business need for them). Built by
// explicit field listing, same discipline toArtisanPublicProfileDto
// already uses in the artisans module for the identical reason: a future
// field added to Order or CustomerAddress must not leak into this view by
// default just because someone spreads the wrong object.
export function toArtisanOrderDto(order: Order): ArtisanOrderDto {
  return {
    id: order.id,
    grandTotal: toFiniteNumber(order.grandTotal),
    status: order.status as OrderStatus,
    bookingId: order.bookingId,
    createdAt: toIsoDate(order.createdAt),
    updatedAt: toIsoDate(order.updatedAt),
    deliveryAddress: toArtisanOrderAddressDto(toOrderAddressDto(order)),
    vendorGroups: (order.vendorGroups ?? []).map(toOrderVendorGroupDto),
  };
}

function toArtisanOrderAddressDto(
  address: CustomerAddressDto | null,
): ArtisanOrderAddressDto | null {
  if (!address) return null;
  return {
    label: address.label,
    addressLine1: address.addressLine1,
    addressLine2: address.addressLine2,
    city: address.city,
    pincode: address.pincode,
  };
}

export function toOrderVendorGroupDto(group: OrderVendorGroup): OrderVendorGroupDto {
  return {
    id: group.id,
    orderId: group.orderId,
    vendorId: group.vendorId,
    shopName: group.vendor?.shopName ?? '',
    subtotal: toFiniteNumber(group.subtotal),
    loadingUnloadingFee: toFiniteNumber(group.loadingUnloadingFee),
    status: group.status as OrderVendorGroupStatus,
    items: (group.items ?? []).map(toOrderItemDto),
  };
}

export function toPaymentEventDto(event: PaymentEvent): PaymentEventDto {
  return {
    id: event.id,
    orderId: event.orderId,
    eventType: event.eventType,
    eventId: event.eventId ?? null,
    rawPayload: event.rawPayload ?? {},
    createdAt: toIsoDate(event.createdAt),
  };
}

export function toRefundDto(refund: Refund): RefundDto {
  return {
    id: refund.id,
    orderId: refund.orderId,
    orderVendorGroupId: refund.orderVendorGroupId,
    rail: refund.rail,
    amountPaise: refund.amountPaise,
    receipt: refund.receipt,
    razorpayRefundId: refund.razorpayRefundId,
    status: refund.status,
    reason: refund.reason,
    createdBy: refund.createdBy,
    createdAt: toIsoDate(refund.createdAt),
  };
}

function toOrderItemDto(item: OrderItem): OrderItemDto {
  return {
    id: item.id,
    vendorListingId: item.vendorListingId,
    masterProductId: item.masterProductId,
    productName: item.masterProduct?.name ?? '',
    productCode: item.masterProduct?.productCode ?? '',
    quantity: toFiniteNumber(item.quantity, 1),
    unitPriceSnapshot: toFiniteNumber(item.unitPriceSnapshot),
  };
}
