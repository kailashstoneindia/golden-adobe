import { describe, expect, it } from 'vitest';

import { parseImageFilename } from './bulkImageNames';

// Decision 0063 / S10: a file is named by product code or part number,
// optionally with "_<n>" for its position.
describe('parseImageFilename', () => {
  it('reads a plain name as one key in position 1', () => {
    expect(parseImageFilename('GA-0110919.jpg')).toEqual({
      candidates: [{ key: 'GA-0110919', order: 1 }],
    });
  });

  it('offers the whole stem first, then the stem without a numbered suffix', () => {
    expect(parseImageFilename('GA-0110919_2.png')).toEqual({
      candidates: [
        { key: 'GA-0110919_2', order: 1 },
        { key: 'GA-0110919', order: 2 },
      ],
    });
  });

  it('only treats the last underscore part as a position', () => {
    expect(parseImageFilename('ZZR_001_3.webp')).toEqual({
      candidates: [
        { key: 'ZZR_001_3', order: 1 },
        { key: 'ZZR_001', order: 3 },
      ],
    });
  });

  it('accepts JPEG in either spelling and any case', () => {
    expect(parseImageFilename('mcb-10.JPEG')?.candidates[0].key).toBe('mcb-10');
  });

  it('refuses a file that is not an image', () => {
    expect(parseImageFilename('notes.txt')).toBeNull();
    expect(parseImageFilename('GA-0110919')).toBeNull();
  });
});
