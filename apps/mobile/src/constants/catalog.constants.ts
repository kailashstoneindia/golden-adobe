/**
 * Launch Level-1 category paths for customer browse.
 * Paths match taxonomy seed slugs (docs/catalog-structure.md).
 * Temporary until a public categories API exists.
 */
export const LAUNCH_CATEGORIES = [
  { id: 'electrical', name: 'Electrical', path: 'electrical' },
  { id: 'plumbing', name: 'Plumbing', path: 'plumbing' },
  { id: 'sanitaryware', name: 'Sanitaryware', path: 'sanitaryware' },
  { id: 'hardware', name: 'Hardware', path: 'hardware' },
  { id: 'lights', name: 'Lights', path: 'lights' },
  { id: 'tiles', name: 'Tiles', path: 'tiles' },
  { id: 'paint', name: 'Paint', path: 'paint' },
  { id: 'stone', name: 'Stone', path: 'stone' },
] as const;

export type LaunchCategory = (typeof LAUNCH_CATEGORIES)[number];

export const SEARCH_PRICE_FILTERS = [
  { id: 'all', label: 'Any price', minPrice: undefined, maxPrice: undefined },
  { id: 'under_500', label: 'Under ₹500', minPrice: undefined, maxPrice: 500 },
  { id: 'under_1000', label: 'Under ₹1,000', minPrice: undefined, maxPrice: 1000 },
  { id: 'over_1000', label: '₹1,000+', minPrice: 1000, maxPrice: undefined },
] as const;

export type SearchPriceFilterId = (typeof SEARCH_PRICE_FILTERS)[number]['id'];
