import { describe, expect, it } from 'vitest';
import { HIRE_REQUEST_STATUSES, TRADE_TYPES } from '@golden-abode/types';

import {
  HIRE_REQUEST_STATUS_LABELS,
  PRODUCT_STATUS_LABELS,
  TRADE_TYPE_LABELS,
  VENDOR_STATUS_LABELS,
  labelFor,
} from './labels';

// Follow-up F10 (decision 0058): admin pages show friendly labels, not codes.
describe('admin labels', () => {
  it('names every trade', () => {
    for (const trade of TRADE_TYPES) {
      expect(TRADE_TYPE_LABELS[trade]).toMatch(/^[A-Z][a-z ]+$/);
    }
  });

  it('names every hire-request status from the admin point of view', () => {
    for (const status of HIRE_REQUEST_STATUSES) {
      expect(HIRE_REQUEST_STATUS_LABELS[status]).toBeTruthy();
    }
    expect(HIRE_REQUEST_STATUS_LABELS.PENDING_ARTISAN_RESPONSE).toBe('Waiting for ustaad');
    expect(HIRE_REQUEST_STATUS_LABELS.EXPIRED).toBe('Expired (no reply)');
  });

  it('names every product status', () => {
    expect(PRODUCT_STATUS_LABELS).toEqual({
      draft: 'Draft',
      pending_review: 'Pending review',
      live: 'Live',
      deprecated: 'Deprecated',
    });
  });

  it('names every vendor status', () => {
    expect(VENDOR_STATUS_LABELS).toEqual({
      PENDING: 'Pending',
      APPROVED: 'Approved',
      REJECTED: 'Rejected',
    });
  });

  it('shows a code the admin does not know as itself, never as another status', () => {
    // A newer backend may send a status this admin build has no label for.
    expect(labelFor(VENDOR_STATUS_LABELS, 'SUSPENDED' as never)).toBe('SUSPENDED');
    expect(labelFor(TRADE_TYPE_LABELS, 'ROOFER' as never)).toBe('ROOFER');
    expect(labelFor(TRADE_TYPE_LABELS, null)).toBe('—');
    expect(labelFor(TRADE_TYPE_LABELS, 'MASON')).toBe('Mason');
  });

  it('ignores inherited object keys', () => {
    expect(labelFor(TRADE_TYPE_LABELS, 'constructor' as never)).toBe('constructor');
  });
});
