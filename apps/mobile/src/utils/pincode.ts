import { APP_CONSTANTS } from '../constants';

const INDIAN_PINCODE_PATTERN = /^[1-9][0-9]{5}$/;

export function sanitizePincodeDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, APP_CONSTANTS.indianPincodeLength);
}

export function isValidIndianPincode(value: string): boolean {
  return INDIAN_PINCODE_PATTERN.test(sanitizePincodeDigits(value));
}
