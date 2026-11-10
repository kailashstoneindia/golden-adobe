import { randomInt } from 'crypto';
import { DEMO_DELIVERY_OTP } from '@golden-abode/types';

// Decision 0060 rule 4: same demo switch as login. With real SMS off the code
// is the fixed demo value; with it on, a random six digit code that never
// starts with 0 (so it survives being typed or stored as a number).
export function generateDeliveryOtp(useRealSms: boolean): string {
  if (!useRealSms) return DEMO_DELIVERY_OTP;
  return String(randomInt(100000, 1000000));
}
