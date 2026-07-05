/**
 * Kailash Stones color tokens.
 *
 * Derived from the brand mark — "Mount Kailash at first light": a deepening
 * navy sky, a tangerine sunrise catching the ridge, all grounded on a warm
 * stone-cream canvas rather than stark white.
 *
 * These are the single source of truth for color. Components must reference
 * these tokens and never hardcode hex values.
 */
export const Colors = {
  // Brand primaries
  tangerine: '#D9531E',
  ember: '#B23E14',
  tangerineTint: '#F6D9C4',

  // Blue scale
  navy: '#0F2B52',
  navySoft: '#1B3F6E',
  navyMid: '#173A66',
  ridgeSilhouette: '#0C1F3B',
  sky: '#2D6CB4',
  skyTint: '#DCEAF7',

  // Neutrals
  cream: '#FAF5EC',
  background: '#EFE8DC',
  white: '#FFFFFF',
  ink: '#221F1B',
  inkSoft: '#6B6258',
  line: '#E7DDD0',
  subtle: '#B7AE9F',

  // Semantic
  sage: '#5B8C5E',
  sageTint: '#E1ECE0',
  brick: '#B23A2E',
  brickTint: '#F3DEDB',

  // Category tile tints (home screen grid)
  categoryElectricalBg: '#FEE9DC',
  categoryStonesBg: '#EDE9FE',
  categorySanitaryBg: '#D1FAE5',
  categoryPaintsBg: '#FEF3C7',
  categoryHardwareBg: '#FCE7F3',
  categoryStonesIcon: '#7C3AED',
  categorySanitaryIcon: '#059669',
  categoryPaintsIcon: '#D97706',
  categoryHardwareIcon: '#DB2777',

  // Splash accents
  lavenderMist: '#CAA6E6',
  sunCore: '#F6A35C',
} as const;

export type ColorToken = keyof typeof Colors;
