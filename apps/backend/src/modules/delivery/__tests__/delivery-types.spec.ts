import {
  DELIVERY_OTP_MAX_ATTEMPTS,
  ORDER_VENDOR_GROUP_NEXT_STATUSES,
  Role,
} from '@golden-abode/types';

describe('delivery shared types', () => {
  it('adds the DRIVER role', () => {
    expect(Role.DRIVER).toBe('DRIVER');
  });

  it('routes group statuses through ready_for_pickup and delivery_failed', () => {
    expect(ORDER_VENDOR_GROUP_NEXT_STATUSES.confirmed).toEqual(['ready_for_pickup', 'cancelled']);
    expect(ORDER_VENDOR_GROUP_NEXT_STATUSES.ready_for_pickup).toEqual([]);
    expect(ORDER_VENDOR_GROUP_NEXT_STATUSES.shipped).toEqual([]);
    expect(ORDER_VENDOR_GROUP_NEXT_STATUSES.delivery_failed).toEqual([]);
  });

  it('locks the OTP after five wrong attempts', () => {
    expect(DELIVERY_OTP_MAX_ATTEMPTS).toBe(5);
  });
});
