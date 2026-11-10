import { DEMO_DELIVERY_OTP } from '@golden-abode/types';
import { generateDeliveryOtp } from '../delivery-otp';
import { assertParentNotLocked } from '../delivery-rules';
import { OrderStatus } from '../../orders/models/order.model';

describe('generateDeliveryOtp (decision 0060 rule 4)', () => {
  it('returns the demo code when real SMS is off', () => {
    expect(generateDeliveryOtp(false)).toBe(DEMO_DELIVERY_OTP);
    expect(DEMO_DELIVERY_OTP).toBe('123456');
  });

  it('returns a six digit code that never starts with 0 when real SMS is on', () => {
    for (let i = 0; i < 200; i += 1) {
      const otp = generateDeliveryOtp(true);
      expect(otp).toMatch(/^\d{6}$/);
      expect(otp.startsWith('0')).toBe(false);
    }
  });
});

describe('assertParentNotLocked', () => {
  it.each([
    OrderStatus.REFUNDED,
    OrderStatus.REFUND_PENDING,
    OrderStatus.REFUND_REQUIRED,
    OrderStatus.CANCELLED,
  ])('refuses a %s parent order', (status) => {
    expect(() => assertParentNotLocked(status)).toThrow(
      'order is refunded, being refunded or cancelled, and its groups can no longer be updated',
    );
  });

  it('allows a confirmed parent order', () => {
    expect(() => assertParentNotLocked(OrderStatus.CONFIRMED)).not.toThrow();
  });
});
