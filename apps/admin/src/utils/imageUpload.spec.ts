import { describe, expect, it } from 'vitest';

import { formatBytes, runWithConcurrency, validateImageFile } from './imageUpload';

const file = (over: Partial<{ name: string; type: string; size: number }> = {}) => ({
  name: 'tile.jpg',
  type: 'image/jpeg',
  size: 1000,
  ...over,
});

describe('validateImageFile', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp'])('accepts %s', (type) => {
    expect(validateImageFile(file({ type }))).toBeNull();
  });

  it.each(['image/heic', 'image/gif', 'application/pdf', 'text/plain', ''])(
    'refuses %s with a message that names the file',
    (type) => {
      expect(validateImageFile(file({ type, name: 'photo.x' }))).toMatch(
        /photo\.x: only JPEG, PNG and WebP/,
      );
    },
  );

  it('refuses an empty file', () => {
    expect(validateImageFile(file({ size: 0 }))).toMatch(/empty/);
  });

  it('accepts a file exactly at the limit and refuses one byte over', () => {
    const limit = 10 * 1024 * 1024;
    expect(validateImageFile(file({ size: limit }))).toBeNull();
    expect(validateImageFile(file({ size: limit + 1 }))).toMatch(/larger than 10\.0 MB/);
  });
});

describe('formatBytes', () => {
  it('uses the largest sensible unit', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});

describe('runWithConcurrency', () => {
  it('never runs more than the limit at once, and runs every item', async () => {
    let inFlight = 0;
    let peak = 0;
    const done: number[] = [];

    await runWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
      done.push(n);
    });

    expect(peak).toBe(3);
    expect([...done].sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('starts items in order', async () => {
    const started: number[] = [];
    await runWithConcurrency([1, 2, 3, 4], 2, async (n) => {
      started.push(n);
    });
    expect(started).toEqual([1, 2, 3, 4]);
  });

  it('copes with fewer items than the limit, and with none', async () => {
    const seen: number[] = [];
    await runWithConcurrency([1, 2], 5, async (n) => {
      seen.push(n);
    });
    await runWithConcurrency([], 3, async () => {
      throw new Error('should not run');
    });
    expect(seen).toEqual([1, 2]);
  });
});
