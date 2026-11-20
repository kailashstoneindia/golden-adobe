import { describe, expect, it } from 'vitest';

import { formatWaiting } from './waiting';

const NOW = new Date('2026-11-12T12:00:00.000Z').getTime();
const ago = (minutes: number) => new Date(NOW - minutes * 60000).toISOString();

describe('formatWaiting', () => {
  it.each([
    [0, '0m'],
    [59, '59m'],
    [60, '1h 0m'],
    [135, '2h 15m'],
    [24 * 60, '1d 0h'],
    [26 * 60 + 5, '1d 2h'],
  ])('%i minutes is %s', (minutes, expected) => {
    expect(formatWaiting(ago(minutes), NOW)).toBe(expected);
  });

  it('never goes negative when the clock is behind', () => {
    expect(formatWaiting(ago(-5), NOW)).toBe('0m');
  });
});
