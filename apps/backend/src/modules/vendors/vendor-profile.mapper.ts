import { VendorAccountDetailsDto, VendorProfileDto } from '@golden-abode/types';

import { Vendor } from './models/vendor.model';
import { VendorAccountDetails } from './models/vendor-account-details.model';

// Extracted from AdminService, which owned the only copy of these mappers
// while it was the only reader of vendor data. Three call sites now need
// them (admin user detail, admin vendor reads, GET /vendors/me), so they
// live here rather than being duplicated — a second copy is how `cityId`
// ends up present on one response shape and missing from another.
//
// Plain functions, not an injectable: they map already-loaded models and
// need no dependencies. Callers are responsible for including
// VendorAccountDetails / City in their query — an omitted include yields
// null here, not a lazy load.

export function formatTimestamp(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string') {
    return value;
  }
  return '';
}

export function toAccountDetailsDto(
  accountDetails?: VendorAccountDetails | null,
): VendorAccountDetailsDto | null {
  if (!accountDetails) {
    return null;
  }

  return {
    id: accountDetails.id,
    vendorId: accountDetails.vendorId,
    accountHolderName: accountDetails.accountHolderName,
    bankName: accountDetails.bankName,
    ifscCode: accountDetails.ifscCode,
    branchName: accountDetails.branchName,
    accountNumber: accountDetails.accountNumber,
    createdAt: formatTimestamp(accountDetails.get('createdAt')),
    updatedAt: formatTimestamp(accountDetails.get('updatedAt')),
  };
}

export function toVendorProfileDto(vendor: Vendor): VendorProfileDto;
export function toVendorProfileDto(vendor?: Vendor | null): VendorProfileDto | undefined;
export function toVendorProfileDto(vendor?: Vendor | null): VendorProfileDto | undefined {
  if (!vendor) {
    return undefined;
  }

  return {
    id: vendor.id,
    userId: vendor.userId,
    shopName: vendor.shopName,
    address: vendor.address,
    latitude: vendor.latitude,
    longitude: vendor.longitude,
    upiId: vendor.upiId,
    bankDetails: vendor.bankDetails,
    accountDetails: toAccountDetailsDto(vendor.accountDetails),
    gstin: vendor.gstin,
    cityId: vendor.cityId,
    // Only populated when the caller included City. A vendor with a
    // cityId but no include gets `city: null` and a non-null cityId —
    // deliberately not a lie about the city being unset.
    city: vendor.city ? { id: vendor.city.id, name: vendor.city.name } : null,
    createdAt: formatTimestamp(vendor.get('createdAt')),
    updatedAt: formatTimestamp(vendor.get('updatedAt')),
  };
}
