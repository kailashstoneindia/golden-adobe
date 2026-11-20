import type { CustomerAddressDto, DeliveryAddressSnapshot } from '@golden-abode/types';
import { CustomerAddress } from '../customers/models/customer-address.model';
import { toNullableNumber } from '../../common/utils/display-number.util';

// Decision 0060: the address a customer paid to have goods delivered to is
// frozen on the order at checkout, so editing the saved address afterwards
// cannot redirect the driver.
export function buildAddressSnapshot(
  address: CustomerAddress,
  recipient: { name: string | null; phone: string | null },
): DeliveryAddressSnapshot {
  return {
    label: address.label,
    addressLine1: address.addressLine1,
    addressLine2: address.addressLine2,
    city: address.city,
    pincode: address.pincode,
    lat: toNullableNumber(address.lat),
    lng: toNullableNumber(address.lng),
    recipientName: recipient.name,
    recipientPhone: recipient.phone,
  };
}

// Shape the existing order views already return, built from the snapshot.
// id/customerId/timestamps come from the order, since a snapshot has none.
export function snapshotToAddressDto(
  snapshot: DeliveryAddressSnapshot,
  order: { deliveryAddressId: string; customerId: string },
  at: string,
): CustomerAddressDto {
  return {
    id: order.deliveryAddressId,
    customerId: order.customerId,
    label: snapshot.label ?? '',
    addressLine1: snapshot.addressLine1,
    addressLine2: snapshot.addressLine2,
    city: snapshot.city,
    pincode: snapshot.pincode,
    lat: snapshot.lat,
    lng: snapshot.lng,
    isDefault: false,
    createdAt: at,
    updatedAt: at,
  };
}
