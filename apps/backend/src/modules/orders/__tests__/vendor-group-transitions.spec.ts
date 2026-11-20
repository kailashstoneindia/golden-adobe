import { ORDER_VENDOR_GROUP_NEXT_STATUSES } from '@golden-abode/types';
import { VENDOR_GROUP_TRANSITIONS } from '../vendor-group-transitions';

// The mobile vendor app builds its buttons from the shared map, so the map must
// offer exactly what the API accepts. A drift here shows up as buttons that
// always answer 400.
describe('shared vendor transitions match the backend (decision 0060)', () => {
  it('offers exactly the transitions the vendor API accepts, for every status', () => {
    expect(ORDER_VENDOR_GROUP_NEXT_STATUSES).toEqual(VENDOR_GROUP_TRANSITIONS);
  });

  it('offers a vendor nothing once the goods are packed', () => {
    for (const status of ['ready_for_pickup', 'shipped', 'delivery_failed'] as const) {
      expect(ORDER_VENDOR_GROUP_NEXT_STATUSES[status]).toEqual([]);
    }
  });
});
