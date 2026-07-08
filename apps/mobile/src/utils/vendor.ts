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

  const accountHolderName = formValues.accountDetails.accountHolderName.trim();
  if (!accountHolderName) {
    return { isValid: false, errorMessage: ERROR_MESSAGES.accountHolderNameRequired };
  }

  const bankName = formValues.accountDetails.bankName.trim();
  if (!bankName) {
    return { isValid: false, errorMessage: ERROR_MESSAGES.bankNameRequired };
  }

  const ifscCode = formValues.accountDetails.ifscCode.trim().toUpperCase();
  if (ifscCode.length !== VENDOR_CONSTANTS.ifscCodeLength) {
    return { isValid: false, errorMessage: ERROR_MESSAGES.ifscCodeInvalid };
  }

  const branchName = formValues.accountDetails.branchName.trim();
  if (!branchName) {
    return { isValid: false, errorMessage: ERROR_MESSAGES.branchNameRequired };
  }

  const accountNumber = formValues.accountDetails.accountNumber.trim();
  const isAccountNumberLengthInvalid = accountNumber.length < VENDOR_CONSTANTS.minAccountNumberLength
    || accountNumber.length > VENDOR_CONSTANTS.maxAccountNumberLength;
  if (isAccountNumberLengthInvalid) {
    return { isValid: false, errorMessage: ERROR_MESSAGES.accountNumberInvalid };
  }

  return { isValid: true, errorMessage: null };
}

export function buildVendorOnboardPayload(
  formValues: VendorOnboardFormValues,
  coordinates: ShopCoordinates,
): VendorOnboardDto {
  const accountNumber = formValues.accountDetails.accountNumber.trim();
  const bankName = formValues.accountDetails.bankName.trim();
  const ifscCode = formValues.accountDetails.ifscCode.trim().toUpperCase();
  const branchName = formValues.accountDetails.branchName.trim();

  const payload: VendorOnboardDto = {
    shopName: formValues.shopName.trim(),
    address: formValues.address.trim(),
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    accountDetails: {
      accountHolderName: formValues.accountDetails.accountHolderName.trim(),
      bankName,
      ifscCode,
      branchName,
      accountNumber,
    },
    bankDetails: `${bankName}, A/C: ${accountNumber}, IFSC: ${ifscCode}, Branch: ${branchName}`,
  };

  const upiId = formValues.upiId.trim();
  const gstin = formValues.gstin.trim().toUpperCase();

  if (upiId) {
    payload.upiId = upiId;
  }
  if (gstin) {
    payload.gstin = gstin;
  }

  return payload;
}
