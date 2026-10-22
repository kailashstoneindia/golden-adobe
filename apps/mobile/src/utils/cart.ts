import type { CartItemDto } from '@golden-abode/types';
import { groupBy, sumBy } from 'lodash';

import { APP_CONSTANTS, CART_LINE_WARNINGS } from '../constants';
import type { CartVendorGroup, PriceSummary } from '../types/order-ui.types';

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

export function buildCartPriceSummary(groups: CartVendorGroup[]): PriceSummary {
  const subtotal = cartGrandTotal(groups);
  const tax = APP_CONSTANTS.unsetTaxAmount;
  const discount = APP_CONSTANTS.unsetDiscountAmount;

  return {
    subtotal,
    tax,
    discount,
    total: subtotal + tax - discount,
    isDiscountApplied: discount > 0,
  };
}

export function hasCartMinOrderShortfall(groups: CartVendorGroup[]): boolean {
  return groups.some((group) => group.shortfall > 0);
}

export function hasPaintCartItems(items: CartItemDto[]): boolean {
  return items.some((item) => item.isPaint);
}

export function isCartItemMissingStock(item: CartItemDto): boolean {
  return !item.isPaint && (item.quantityAvailable === null || item.quantityAvailable <= 0);
}

export function hasUnstockedCartItems(items: CartItemDto[]): boolean {
  return items.some(isCartItemMissingStock);
}

export function cartLineWarning(item: CartItemDto): string | null {
  if (item.isPaint) {
    return CART_LINE_WARNINGS.paint;
  }
  if (item.quantityAvailable === null) {
    return CART_LINE_WARNINGS.noStock;
  }
  if (item.quantityAvailable <= 0) {
    return CART_LINE_WARNINGS.outOfStock;
  }
  return null;
}
