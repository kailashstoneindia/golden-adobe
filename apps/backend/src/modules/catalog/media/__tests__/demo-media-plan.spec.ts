import { ImageFile, ProductRef, planDemoMedia } from '../demo-media-plan';

const image = (stem: string): ImageFile => ({ stem, path: `/assets/${stem}.jpg` });
const product = (id: string, partNumber: string): ProductRef => ({ id, partNumber });
const none = new Set<string>();

describe('planDemoMedia', () => {
  it('gives each product the image named after its part number', () => {
    const plan = planDemoMedia(
      [image('GVT-AMBRE-6060'), image('GVT-ARYAN-6060')],
      [product('p1', 'GVT-AMBRE-6060'), product('p2', 'GVT-ARYAN-6060')],
      none,
    );

    expect(plan.assignments).toEqual([
      {
        productId: 'p1',
        partNumber: 'GVT-AMBRE-6060',
        imagePath: '/assets/GVT-AMBRE-6060.jpg',
        via: 'exact',
      },
      {
        productId: 'p2',
        partNumber: 'GVT-ARYAN-6060',
        imagePath: '/assets/GVT-ARYAN-6060.jpg',
        via: 'exact',
      },
    ]);
    expect(plan.withoutImage).toEqual([]);
    expect(plan.unusedImages).toEqual([]);
  });

  it('shares a base-code photo across every colour variant of a cistern', () => {
    const plan = planDemoMedia(
      [image('C-001')],
      [product('p1', 'C-001/IV'), product('p2', 'C-001/WH'), product('p3', 'C-001/CLR')],
      none,
    );

    expect(plan.assignments.map((a) => [a.partNumber, a.via])).toEqual([
      ['C-001/IV', 'base-code'],
      ['C-001/WH', 'base-code'],
      ['C-001/CLR', 'base-code'],
    ]);
    expect(new Set(plan.assignments.map((a) => a.imagePath))).toEqual(
      new Set(['/assets/C-001.jpg']),
    );
  });

  it('matches multi-level variants such as C-007/FLR/IV', () => {
    const plan = planDemoMedia([image('C-007')], [product('p1', 'C-007/FLR/IV')], none);

    expect(plan.assignments).toHaveLength(1);
  });

  it('never lets a base code claim a different part number that merely starts the same way', () => {
    const plan = planDemoMedia(
      [image('C-001')],
      [product('p1', 'C-0010'), product('p2', 'C-001A'), product('p3', 'C-001')],
      none,
    );

    // Only the product literally named C-001 matches, and exactly.
    expect(plan.assignments.map((a) => [a.partNumber, a.via])).toEqual([['C-001', 'exact']]);
    expect(plan.withoutImage.map((p) => p.partNumber)).toEqual(['C-0010', 'C-001A']);
  });

  it('prefers an exact image over the base-code one for the same product', () => {
    const plan = planDemoMedia(
      [image('C-001'), image('C-001/IV')],
      [product('p1', 'C-001/IV'), product('p2', 'C-001/WH')],
      none,
    );

    expect(plan.assignments.find((a) => a.productId === 'p1')).toMatchObject({
      imagePath: '/assets/C-001/IV.jpg',
      via: 'exact',
    });
    expect(plan.assignments.find((a) => a.productId === 'p2')).toMatchObject({ via: 'base-code' });
  });

  it('leaves a product that already has an image alone, so a re-run changes nothing', () => {
    const plan = planDemoMedia(
      [image('A-1'), image('A-2')],
      [product('p1', 'A-1'), product('p2', 'A-2')],
      new Set(['p1']),
    );

    expect(plan.assignments.map((a) => a.productId)).toEqual(['p2']);
    expect(plan.skippedExisting.map((p) => p.id)).toEqual(['p1']);
    // A skipped product is not "without an image": it already has one.
    expect(plan.withoutImage).toEqual([]);
  });

  it('is empty on a second run once everything has an image', () => {
    const plan = planDemoMedia([image('A-1')], [product('p1', 'A-1')], new Set(['p1']));

    expect(plan.assignments).toEqual([]);
    // Idle because their products already have them, not because they match nothing.
    expect(plan.unusedImages).toEqual([]);
  });

  it('does not call a base-code photo unused when its variants already have an image', () => {
    const plan = planDemoMedia(
      [image('C-001')],
      [product('p1', 'C-001/IV'), product('p2', 'C-001/WH')],
      new Set(['p1', 'p2']),
    );

    expect(plan.assignments).toEqual([]);
    expect(plan.unusedImages).toEqual([]);
  });

  it('reports images that match no product, and products left without any image', () => {
    const plan = planDemoMedia(
      [image('ORPHAN-1'), image('A-1')],
      [product('p1', 'A-1'), product('p2', 'NO-PHOTO')],
      none,
    );

    expect(plan.unusedImages.map((i) => i.stem)).toEqual(['ORPHAN-1']);
    expect(plan.withoutImage.map((p) => p.partNumber)).toEqual(['NO-PHOTO']);
  });

  it('handles nothing to do', () => {
    expect(planDemoMedia([], [], none)).toEqual({
      assignments: [],
      skippedExisting: [],
      unusedImages: [],
      withoutImage: [],
    });
  });

  it('is case-sensitive, like the part numbers themselves', () => {
    const plan = planDemoMedia([image('gvt-ambre-6060')], [product('p1', 'GVT-AMBRE-6060')], none);

    expect(plan.assignments).toEqual([]);
  });
});
