import type { CategoryAttribute, CategoryNode, ProductDetail } from '@/types/catalog.types';
import type { ProductReadinessDto } from '@golden-abode/types';

export const LEAF_ID = 'c2222222-2222-4222-8222-222222222222';
export const PARENT_ID = 'c1111111-1111-4111-8111-111111111111';

export function categoryTree(
  over: { parentHsn?: string | null; leafHsn?: string | null } = {},
): CategoryNode[] {
  const leaf: CategoryNode = {
    id: LEAF_ID,
    parentId: PARENT_ID,
    name: 'Switches',
    slug: 'switches',
    path: 'electrical/switches',
    level: 2,
    isLeaf: true,
    unitOfMeasure: null,
    hsnCodeDefault: over.leafHsn ?? null,
    productCount: 0,
    children: [],
  };
  return [
    {
      id: PARENT_ID,
      parentId: null,
      name: 'Electrical',
      slug: 'electrical',
      path: 'electrical',
      level: 1,
      isLeaf: false,
      unitOfMeasure: null,
      hsnCodeDefault: over.parentHsn === undefined ? '8536' : over.parentHsn,
      productCount: 0,
      children: [leaf],
    },
  ];
}

export function attribute(over: Partial<CategoryAttribute> = {}): CategoryAttribute {
  return {
    id: 'a1111111-1111-4111-8111-111111111111',
    code: 'finish',
    name: 'Finish',
    dataType: 'enum',
    unit: null,
    isVariantDefining: true,
    isSearchableFilter: true,
    scope: 'own',
    declaredOn: 'electrical/switches',
    options: ['Matte', 'Gloss'],
    ...over,
  } as CategoryAttribute;
}

export function readiness(over: Partial<Record<string, boolean>> = {}): ProductReadinessDto {
  const passed = {
    image: false,
    required_attributes: true,
    hsn_code: true,
    listing: false,
    ...over,
  };
  return {
    ready: passed.image && passed.required_attributes,
    checks: [
      {
        code: 'image',
        label: 'At least one image',
        blocking: true,
        passed: passed.image,
        ...(passed.image ? {} : { detail: 'needs at least one image' }),
      },
      {
        code: 'required_attributes',
        label: 'Required attributes',
        blocking: true,
        passed: passed.required_attributes,
      },
      {
        code: 'hsn_code',
        label: 'HSN code',
        blocking: false,
        passed: passed.hsn_code,
        ...(passed.hsn_code
          ? {}
          : { detail: 'Needed on invoices; publishing is allowed without it for now' }),
      },
      {
        code: 'listing',
        label: 'At least one active vendor listing',
        blocking: false,
        passed: passed.listing,
      },
    ],
  };
}

export function productDetail(over: Partial<ProductDetail> = {}): ProductDetail {
  return {
    id: 'p9999999-9999-4999-8999-999999999999',
    productCode: 'GA-0000900',
    name: 'Modular switch 6A',
    slug: 'modular-switch-6a-abc123',
    status: 'draft',
    categoryId: LEAF_ID,
    categoryPath: 'electrical/switches',
    brand: 'Havells',
    brandId: 'b1111111-1111-4111-8111-111111111111',
    mergedIntoId: null,
    mfrPartNumber: 'SW-6A',
    gtin: null,
    hsnCode: '8536',
    gstRate: 18,
    countryOfOrigin: 'India',
    isGeneric: false,
    attributesFlat: {},
    listingCount: 0,
    createdAt: '2026-11-20T10:00:00.000Z',
    updatedAt: '2026-11-20T10:00:00.000Z',
    attributeValues: [
      { code: 'finish', name: 'Finish', unit: null, value: 'Matte', isVariantDefining: true },
    ],
    media: [],
    description: null,
    productFamily: null,
    stoneVariety: null,
    unitOfMeasure: null,
    saleUnitType: 'discrete',
    packContentQty: null,
    hasNaturalVariation: false,
    importerDetails: null,
    bestPrice: null,
    bestVendorName: null,
    listings: [],
    ...over,
  } as ProductDetail;
}
