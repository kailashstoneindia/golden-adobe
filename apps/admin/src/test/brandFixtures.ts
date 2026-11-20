import type { BrandDto } from '@golden-abode/types';

export function brand(over: Partial<BrandDto> = {}): BrandDto {
  return {
    id: 'b1111111-1111-4111-8111-111111111111',
    name: 'Havells',
    slug: 'havells',
    logoUrl: null,
    manufacturerName: 'Havells India Ltd',
    manufacturerAddress: 'QRG Towers, Noida',
    consumerCareEmail: 'care@havells.test',
    consumerCarePhone: '+91 1800 11 0303',
    isActive: true,
    mergedIntoId: null,
    productCount: 12,
    aliases: [],
    ...over,
  };
}

export function page<T>(items: T[]) {
  return { items, total: items.length, page: 1, limit: 25, totalPages: 1 };
}
