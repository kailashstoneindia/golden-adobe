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
