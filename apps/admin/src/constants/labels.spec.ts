import { describe, expect, it } from 'vitest';
import { TRADE_TYPES } from '@golden-abode/types';

import {
  HIRE_REQUEST_STATUS_LABELS,
  PRODUCT_STATUS_LABELS,
  TRADE_TYPE_LABELS,
  labelFor,
} from './labels';

// Follow-up F10 (decision 0056): admin pages show friendly labels, not codes.
describe('admin labels', () => {
  it('names every trade', () => {
    for (const trade of TRADE_TYPES) {
      expect(TRADE_TYPE_LABELS[trade]).toMatch(/^[A-Z][a-z ]+$/);
    }
  });

  it('names every hire-request status from the admin point of view', () => {
    expect(HIRE_REQUEST_STATUS_LABELS.PENDING_ARTISAN_RESPONSE).toBe('Waiting for ustaad');
    expect(HIRE_REQUEST_STATUS_LABELS.EXPIRED).toBe('Expired (no reply)');
    expect(Object.keys(HIRE_REQUEST_STATUS_LABELS)).toHaveLength(9);
  });

  it('names every product status', () => {
    expect(PRODUCT_STATUS_LABELS).toEqual({
      draft: 'Draft',
      pending_review: 'Pending review',
      live: 'Live',
      deprecated: 'Deprecated',
    });
  });

  it('falls back to the code for a value a newer backend might send', () => {
    expect(labelFor(TRADE_TYPE_LABELS, 'ROOFER')).toBe('ROOFER');
    expect(labelFor(TRADE_TYPE_LABELS, null)).toBe('—');
    expect(labelFor(TRADE_TYPE_LABELS, 'MASON')).toBe('Mason');
  });
});
