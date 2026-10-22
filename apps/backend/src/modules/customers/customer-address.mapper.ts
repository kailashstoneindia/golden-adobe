import type { CustomerAddressDto } from '@golden-abode/types';
import { CustomerAddress } from './models/customer-address.model';
import { toIsoDate, toNullableNumber } from '../../common/utils/display-number.util';

export function toCustomerAddressDto(address: CustomerAddress): CustomerAddressDto {
  return {
    id: address.id,
    customerId: address.customerId,
    label: address.label,
    addressLine1: address.addressLine1,
    addressLine2: address.addressLine2,
    city: address.city,
    pincode: address.pincode,
    lat: toNullableNumber(address.lat),
    lng: toNullableNumber(address.lng),
    isDefault: address.isDefault,
    createdAt: toIsoDate(address.createdAt),
    updatedAt: toIsoDate(address.updatedAt),
  };
}
