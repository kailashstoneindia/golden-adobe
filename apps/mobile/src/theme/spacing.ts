/**
 * Spacing scale (in density-independent pixels) and corner radii.
 * Used for padding, margin, and gaps across the app.
 */
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const Radius = {
  sm: 10,
  md: 14,
  lg: 20,
  full: 999,
} as const;

export type SpacingToken = keyof typeof Spacing;
export type RadiusToken = keyof typeof Radius;
