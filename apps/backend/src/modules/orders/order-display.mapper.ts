import type {
  OrderDto,
  OrderItemDto,
  OrderStatus,
  OrderVendorGroupDto,
  OrderVendorGroupStatus,
  PaymentEventDto,
} from '@golden-abode/types';
import { Order } from './models/order.model';
import { OrderVendorGroup } from './models/order-vendor-group.model';
import { OrderItem } from './models/order-item.model';
import { PaymentEvent } from './models/payment-event.model';
import { toCustomerAddressDto } from '../customers/customer-address.mapper';
import { toFiniteNumber, toIsoDate } from '../../common/utils/display-number.util';

export function toOrderDto(order: Order, includeDeliveryAddress: boolean): OrderDto {
  return {
    id: order.id,
    customerId: order.customerId,
    deliveryAddressId: order.deliveryAddressId,
    grandTotal: toFiniteNumber(order.grandTotal),
    status: order.status as OrderStatus,
    razorpayOrderId: order.razorpayOrderId,
    razorpayPaymentId: order.razorpayPaymentId,
    bookingId: order.bookingId,
    createdAt: toIsoDate(order.createdAt),
    updatedAt: toIsoDate(order.updatedAt),
    deliveryAddress:
      includeDeliveryAddress && order.deliveryAddress
        ? toCustomerAddressDto(order.deliveryAddress)
        : null,
    vendorGroups: (order.vendorGroups ?? []).map(toOrderVendorGroupDto),
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
    rawPayload: event.rawPayload ?? {},
    createdAt: toIsoDate(event.createdAt),
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
