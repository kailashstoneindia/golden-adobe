import { projectOrderStatus } from '../refund-status';
import { OrderStatus } from '../models/order.model';

// Decision 0054 rule 6: the order status follows the money movement.
describe('projectOrderStatus (decision 0054)', () => {
  it.each([
    ['confirmed', 100000, 100000, 0, 'refunded'],
    ['refund_pending', 100000, 0, 100000, 'refund_pending'],
    ['confirmed', 100000, 0, 100000, 'refund_pending'],
    ['refund_pending', 100000, 0, 0, 'refund_required'],
    ['confirmed', 100000, 20000, 0, 'confirmed'],
    ['refund_required', 100000, 0, 0, 'refund_required'],
    ['refund_required', 100000, 0, 100000, 'refund_pending'],
    ['confirmed', 100000, 20000, 80000, 'refund_pending'],
    ['confirmed', 100000, 0, 20000, 'confirmed'],
    ['refunded', 100000, 100000, 0, 'refunded'],
    ['cancelled', 100000, 0, 100000, 'cancelled'],
    ['pending_payment', 100000, 0, 0, 'pending_payment'],
  ])('%s captured=%i processed=%i open=%i → %s', (cur, cap, proc, open, expected) =>
    expect(projectOrderStatus(cur as OrderStatus, cap, proc, open)).toBe(expected),
  );
});
