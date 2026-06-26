export const INDIA_COUNTRY_CODE = '+91';

export function sanitizePhoneDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, 10);
}

export function toE164(localNumber: string): string {
  return `${INDIA_COUNTRY_CODE}${sanitizePhoneDigits(localNumber)}`;
}

export function isValidIndianMobile(localNumber: string): boolean {
  return /^[6-9]\d{9}$/.test(sanitizePhoneDigits(localNumber));
}

export function formatPhoneDisplay(e164: string): string {
  const digits = sanitizePhoneDigits(e164);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)} ${digits.slice(5)}`;
}
