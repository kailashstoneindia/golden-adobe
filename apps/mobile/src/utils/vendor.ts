import type { VendorOnboardDto } from '@golden-abode/types';

import { ERROR_MESSAGES } from '../constants/error.constants';
import { VENDOR_CONSTANTS } from '../constants/vendor.constants';
import type {
  ShopCoordinates,
  VendorOnboardFormValues,
  VendorOnboardValidationResult,
} from '../types';

export function validateVendorOnboardForm(
  formValues: VendorOnboardFormValues,
  coordinates: ShopCoordinates | null,
): VendorOnboardValidationResult {
  const shopName = formValues.shopName.trim();
  if (shopName.length < VENDOR_CONSTANTS.shopNameMinLength) {
    return { isValid: false, errorMessage: ERROR_MESSAGES.shopNameRequired };
  }

  const address = formValues.address.trim();
  if (address.length < VENDOR_CONSTANTS.addressMinLength) {
    return { isValid: false, errorMessage: ERROR_MESSAGES.addressRequired };
  }

  if (!coordinates) {
    return { isValid: false, errorMessage: ERROR_MESSAGES.locationRequired };
  }

  const gstin = formValues.gstin.trim();
  if (gstin.length > 0 && gstin.length !== VENDOR_CONSTANTS.gstinLength) {
    return { isValid: false, errorMessage: ERROR_MESSAGES.gstinLength };
  }

  return { isValid: true, errorMessage: null };
}

export function buildVendorOnboardPayload(
  formValues: VendorOnboardFormValues,
  coordinates: ShopCoordinates,
): VendorOnboardDto {
  const payload: VendorOnboardDto = {
    shopName: formValues.shopName.trim(),
    address: formValues.address.trim(),
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
  };

  const upiId = formValues.upiId.trim();
  const bankDetails = formValues.bankDetails.trim();
  const gstin = formValues.gstin.trim().toUpperCase();

  if (upiId) {
    payload.upiId = upiId;
  }
  if (bankDetails) {
    payload.bankDetails = bankDetails;
  }
  if (gstin) {
    payload.gstin = gstin;
  }

  return payload;
}
