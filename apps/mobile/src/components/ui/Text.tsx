import { Text as RNText, StyleSheet, type TextProps as RNTextProps } from 'react-native';

import { Typography, type TypographyVariant } from '../../theme';

export interface TextProps extends RNTextProps {
  /**
   * Type-scale variant. Applies the matching font family, size, line height,
   * and default color from the theme. Defaults to `body`.
   */
  variant?: TypographyVariant;
  /** Overrides the variant's default color. Pass a theme color token value. */
  color?: string;
}

const styles = StyleSheet.create(Typography);

/**
 * Themed text primitive. All app text should go through this component so the
 * type scale stays consistent across iOS and Android.
 */
export function Text({ variant = 'body', color, style, ...rest }: TextProps) {
  return <RNText style={[styles[variant], color ? { color } : null, style]} {...rest} />;
}
