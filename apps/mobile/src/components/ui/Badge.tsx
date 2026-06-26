import {
  Platform,
  StyleSheet,
  Text as RNText,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Colors, FontFamily, Radius, Spacing } from '../../theme';

export type BadgeVariant = 'pending' | 'success' | 'info' | 'error';

export interface BadgeProps {
  /** Status this pill represents. Defaults to `info`. */
  variant?: BadgeVariant;
  /** Pill text (e.g. "Dispatched", "Delivered"). */
  label: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Status pill mapping each variant to a semantic color pair from the theme.
 * Uses DM Mono so statuses read as data, matching the design language.
 */
export function Badge({ variant = 'info', label, style }: BadgeProps) {
  return (
    <View style={[styles.base, containerStyles[variant], style]}>
      <RNText style={[styles.label, labelStyles[variant]]} numberOfLines={1}>
        {label}
      </RNText>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    borderRadius: Radius.full,
    paddingVertical: Spacing.xs + 1,
    paddingHorizontal: Spacing.md - 1,
  },
  label: {
    fontFamily: FontFamily.dmMono.regular,
    fontSize: 11,
    letterSpacing: 0.2,
    ...Platform.select({ android: { includeFontPadding: false }, default: {} }),
  },
});

const containerStyles = StyleSheet.create({
  pending: { backgroundColor: Colors.tangerineTint },
  success: { backgroundColor: Colors.sageTint },
  info: { backgroundColor: Colors.skyTint },
  error: { backgroundColor: Colors.brickTint },
});

const labelStyles = StyleSheet.create({
  pending: { color: Colors.ember },
  success: { color: Colors.sage },
  info: { color: Colors.sky },
  error: { color: Colors.brick },
});
