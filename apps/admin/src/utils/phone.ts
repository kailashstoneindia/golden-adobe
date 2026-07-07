import { APP_CONSTANTS } from '@/constants/appConstants';

export function sanitizePhoneDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, 10);
}

export function toE164(localNumber: string): string {
  return `${APP_CONSTANTS.phoneCountryCode}${sanitizePhoneDigits(localNumber)}`;
}

export function isValidIndianMobile(localNumber: string): boolean {
  return /^[6-9]\d{9}$/.test(sanitizePhoneDigits(localNumber));
}

export function formatPhoneDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const local = digits.length >= 12 && digits.startsWith('91') ? digits.slice(2, 12) : digits.slice(0, 10);
  if (local.length <= 5) return local;
  return `${local.slice(0, 5)} ${local.slice(5)}`;
}
