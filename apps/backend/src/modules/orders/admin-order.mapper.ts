import { AdminOrderDto } from '@golden-abode/types';

import { toAdminContactDto } from '../../common/mappers/admin-contact.mapper';
import { toIsoDate } from '../../common/utils/display-number.util';
import { Order } from './models/order.model';
import { toOrderFields, toOrderVendorGroupDto } from './order-display.mapper';

// The admin's view of an order (decision 0058 Task 4d). Built on the shared
// order fields, so customers and vendors keep receiving exactly what they did.
export function toAdminOrderDto(order: Order): AdminOrderDto {
  const groups = order.vendorGroups ?? [];
  return {
    ...toOrderFields(order, true),
    customer: toAdminContactDto(order.customer?.user),
    customerFullName: order.customer?.fullName ?? null,
    vendorGroups: groups.map((group) => ({
      ...toOrderVendorGroupDto(group),
      vendor: toAdminContactDto(group.vendor?.user),
      createdAt: toIsoDate(group.createdAt),
      updatedAt: toIsoDate(group.updatedAt),
    })),
    itemCount: groups.reduce((count, group) => count + (group.items?.length ?? 0), 0),
    hireRequestId: order.bookingId ?? null,
  };
}
