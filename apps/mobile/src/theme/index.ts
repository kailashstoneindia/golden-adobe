import { Colors } from './colors';
import { Radius, Spacing } from './spacing';
import { FontFamily, Typography } from './typography';

export { Colors } from './colors';
export type { ColorToken } from './colors';
export { Spacing, Radius } from './spacing';
export type { SpacingToken, RadiusToken } from './spacing';
export { Typography, FontFamily } from './typography';
export type { TypographyVariant, FontFamilyGroups } from './typography';

/**
 * The unified theme object. Prefer importing the individual token groups
 * (`Colors`, `Spacing`, etc.) directly; this aggregate is provided for cases
 * where passing the whole theme around (e.g. a provider) is convenient.
 */
export const theme = {
  colors: Colors,
  spacing: Spacing,
  radius: Radius,
  typography: Typography,
  fontFamily: FontFamily,
} as const;

export type Theme = typeof theme;
