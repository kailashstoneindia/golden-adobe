export const INDIA_COUNTRY_CODE = '+91';

/** Keeps only digits from a local 10-digit Indian mobile input. */
export function sanitizePhoneDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, 10);
}

/** Extracts the 10-digit local number from E.164 (+91…) or raw digit strings. */
export function toLocalIndianDigits(phone: string): string {
  const digits = phone.replace(/\D/g, '');

  if (digits.length >= 12 && digits.startsWith('91')) {
    return digits.slice(2, 12);
  }

  return digits.slice(0, 10);
}

export function toE164(localNumber: string): string {
  return `${INDIA_COUNTRY_CODE}${sanitizePhoneDigits(localNumber)}`;
}

export function isValidIndianMobile(localNumber: string): boolean {
  return /^[6-9]\d{9}$/.test(sanitizePhoneDigits(localNumber));
}

/** Formats a local or E.164 number as `82792 02574`. */
export function formatPhoneDisplay(phone: string): string {
  const local = toLocalIndianDigits(phone);
  if (local.length <= 5) return local;
  return `${local.slice(0, 5)} ${local.slice(5)}`;
}

/** Formats a local or E.164 number as `+91 82792 02574`. */
export function formatIndianPhoneDisplay(phone: string): string {
  return `${INDIA_COUNTRY_CODE} ${formatPhoneDisplay(phone)}`;
}
