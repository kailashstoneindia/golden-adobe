import type { CartDto, CartItemDto, CartListingStatus } from '@golden-abode/types';
import { SaleUnitType } from '../catalog/models/master-product.model';
import { Cart } from './models/cart.model';
import { CartItem } from './models/cart-item.model';
import { toFiniteNumber, toNullableNumber } from '../../common/utils/display-number.util';

export function toCartDto(cart: Cart): CartDto {
  const items = (cart.items ?? []).map(toCartItemDto);
  return { id: cart.id, items };
}

function toCartItemDto(item: CartItem): CartItemDto {
  const listing = item.vendorListing;
  const vendor = listing?.vendor;
  const product = listing?.masterProduct;
  const inventory = listing?.inventory?.[0];

  return {
    id: item.id,
    quantity: toFiniteNumber(item.quantity, 1),
    vendorListingId: item.vendorListingId,
    vendorId: listing?.vendorId ?? vendor?.id ?? '',
    shopName: vendor?.shopName ?? '',
    masterProductId: listing?.masterProductId ?? product?.id ?? '',
    productName: product?.name ?? '',
    productCode: product?.productCode ?? '',
    price: toFiniteNumber(listing?.price),
    mrp: toNullableNumber(listing?.mrp),
    status: toListingStatus(listing?.status),
    minOrderValue: toNullableNumber(vendor?.minOrderValue),
    quantityAvailable: toNullableNumber(inventory?.quantityAvailable),
    isPaint: product?.saleUnitType === SaleUnitType.TINTED_TO_ORDER,
  };
}

function toListingStatus(status: string | undefined): CartListingStatus {
  if (status === 'paused' || status === 'out_of_stock') {
    return status;
  }
  return 'active';
}
