// Decides which demo image goes on which product (decision 0031). Pure: the
// loader script does the I/O, this is the part worth testing.
//
// Vendor image files are named after the product's manufacturer part number
// (GVT-AMBRE-6060.jpg). Most match exactly. Pearl's cisterns are the exception:
// one photo (C-001.jpg) covers every colour variant, which are written with a
// "/" suffix (C-001/IV, C-001/WH, C-001/CLR), so those get the base-code photo.

export type ImageFile = { stem: string; path: string };
export type ProductRef = { id: string; partNumber: string };

export type Assignment = {
  productId: string;
  partNumber: string;
  imagePath: string;
  via: 'exact' | 'base-code';
};

export type DemoMediaPlan = {
  assignments: Assignment[];
  // Products that already have an image, left alone so a re-run changes nothing.
  skippedExisting: ProductRef[];
  // Image files that matched no product at all.
  unusedImages: ImageFile[];
  // Products that will still have no image after this plan.
  withoutImage: ProductRef[];
};

export function planDemoMedia(
  images: ImageFile[],
  products: ProductRef[],
  alreadyHasImage: ReadonlySet<string>,
): DemoMediaPlan {
  const eligible = products.filter((p) => !alreadyHasImage.has(p.id));
  const skippedExisting = products.filter((p) => alreadyHasImage.has(p.id));

  const byPart = new Map(eligible.map((p) => [p.partNumber, p]));
  const assigned = new Map<string, Assignment>();
  const used = new Set<string>();

  // An exact match always wins, so it is settled for every product first.
  for (const image of images) {
    const product = byPart.get(image.stem);
    if (!product) continue;
    assigned.set(product.id, {
      productId: product.id,
      partNumber: product.partNumber,
      imagePath: image.path,
      via: 'exact',
    });
    used.add(image.stem);
  }

  // Then the base-code photo goes to each variant that has no exact image.
  // "/" is part of the prefix on purpose: C-001 must never claim C-0010 or C-001A.
  for (const image of images) {
    if (used.has(image.stem)) continue;
    for (const product of eligible) {
      if (assigned.has(product.id)) continue;
      if (product.partNumber.startsWith(`${image.stem}/`)) {
        assigned.set(product.id, {
          productId: product.id,
          partNumber: product.partNumber,
          imagePath: image.path,
          via: 'base-code',
        });
        used.add(image.stem);
      }
    }
  }

  // "Unused" means no product at all would take the file. Judged against EVERY
  // product, not just the eligible ones: on a re-run the images are idle because
  // their products already have them, which is not the same as matching nothing.
  const matchesAnyProduct = (image: ImageFile) =>
    products.some((p) => p.partNumber === image.stem || p.partNumber.startsWith(`${image.stem}/`));

  return {
    assignments: eligible.filter((p) => assigned.has(p.id)).map((p) => assigned.get(p.id)!),
    skippedExisting,
    unusedImages: images.filter((i) => !matchesAnyProduct(i)),
    withoutImage: eligible.filter((p) => !assigned.has(p.id)),
  };
}
