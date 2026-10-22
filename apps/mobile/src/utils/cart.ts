import type { CartItemDto } from '@golden-abode/types';
import { groupBy, sumBy } from 'lodash';

import type { CartVendorGroup } from '../types/order-ui.types';

export function groupCartItemsByShop(items: CartItemDto[]): CartVendorGroup[] {
  const grouped = groupBy(items, (item) => item.vendorId);
  return Object.values(grouped).map(toCartVendorGroup);
}

function toCartVendorGroup(items: CartItemDto[]): CartVendorGroup {
  const firstItem = items[0];
  const subtotal = sumBy(items, (item) => item.price * item.quantity);
  const minOrderValue = firstItem.minOrderValue;
  const shortfall =
    minOrderValue !== null && minOrderValue > 0 ? Math.max(minOrderValue - subtotal, 0) : 0;

  return {
    vendorId: firstItem.vendorId,
    shopName: firstItem.shopName,
    minOrderValue,
    items,
    subtotal,
    shortfall,
  };
}

export function cartGrandTotal(groups: CartVendorGroup[]): number {
  return sumBy(groups, (group) => group.subtotal);
}

export function hasCartMinOrderShortfall(groups: CartVendorGroup[]): boolean {
  return groups.some((group) => group.shortfall > 0);
}

export function hasPaintCartItems(items: CartItemDto[]): boolean {
  return items.some((item) => item.isPaint);
}
