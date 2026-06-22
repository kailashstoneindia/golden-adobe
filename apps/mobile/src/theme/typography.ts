import { Platform, type TextStyle } from 'react-native';

import { Colors } from './colors';

/**
 * Loaded font family names.
 *
 * With custom fonts in React Native the weight is baked into the family name
 * (e.g. `Poppins_600SemiBold`) rather than applied via `fontWeight`. We rely on
 * the family alone and intentionally do NOT set `fontWeight` in the type scale,
 * because combining a weighted family with `fontWeight` triggers Android's
 * synthetic ("faux") bolding and renders inconsistently across platforms.
 *
 * Keys mirror the exports from the `@expo-google-fonts/*` packages, which are
 * also the strings registered with the native font manager.
 */
export const FontFamily = {
  poppins: {
    regular: 'Poppins_400Regular',
    medium: 'Poppins_500Medium',
    semibold: 'Poppins_600SemiBold',
    bold: 'Poppins_700Bold',
  },
  inter: {
    regular: 'Inter_400Regular',
    medium: 'Inter_500Medium',
    semibold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
  },
  dmMono: {
    regular: 'DMMono_400Regular',
    medium: 'DMMono_500Medium',
  },
} as const;

export type TypographyVariant =
  | 'display'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'body'
  | 'bodyMedium'
  | 'caption'
  | 'label'
  | 'numeric'
  | 'numericSm';

/**
 * Strips the extra top/bottom padding Android adds around glyphs so line-height
 * math matches iOS. No-op on iOS.
 */
const noFontPadding: TextStyle = Platform.select({
  android: { includeFontPadding: false },
  default: {},
});

/**
 * The named type scale. Each entry carries the right font family, size,
 * line height, and default color so the `Text` component can apply a complete,
 * platform-consistent style from a single `variant` prop.
 */
export const Typography: Record<TypographyVariant, TextStyle> = {
  // Poppins — headings / display
  display: {
    fontFamily: FontFamily.poppins.semibold,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.3,
    color: Colors.ink,
    ...noFontPadding,
  },
  h1: {
    fontFamily: FontFamily.poppins.semibold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.2,
    color: Colors.ink,
    ...noFontPadding,
  },
  h2: {
    fontFamily: FontFamily.poppins.semibold,
    fontSize: 22,
    lineHeight: 28,
    color: Colors.ink,
    ...noFontPadding,
  },
  h3: {
    fontFamily: FontFamily.poppins.semibold,
    fontSize: 17,
    lineHeight: 22,
    color: Colors.ink,
    ...noFontPadding,
  },

  // Inter — body / UI text
  body: {
    fontFamily: FontFamily.inter.regular,
    fontSize: 15,
    lineHeight: 22,
    color: Colors.ink,
    ...noFontPadding,
  },
  bodyMedium: {
    fontFamily: FontFamily.inter.medium,
    fontSize: 15,
    lineHeight: 22,
    color: Colors.ink,
    ...noFontPadding,
  },
  caption: {
    fontFamily: FontFamily.inter.medium,
    fontSize: 12.5,
    lineHeight: 18,
    color: Colors.inkSoft,
    ...noFontPadding,
  },
  label: {
    fontFamily: FontFamily.inter.semibold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: Colors.tangerine,
    ...noFontPadding,
  },

  // DM Mono — numeric / data
  numeric: {
    fontFamily: FontFamily.dmMono.medium,
    fontSize: 19,
    lineHeight: 24,
    color: Colors.ink,
    ...noFontPadding,
  },
  numericSm: {
    fontFamily: FontFamily.dmMono.regular,
    fontSize: 14,
    lineHeight: 18,
    color: Colors.ink,
    ...noFontPadding,
  },
};

export type FontFamilyGroups = typeof FontFamily;
