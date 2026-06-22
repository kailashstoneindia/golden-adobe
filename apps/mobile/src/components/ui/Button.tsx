import {
  Platform,
  Pressable,
  StyleSheet,
  Text as RNText,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Colors, FontFamily, Radius, Spacing } from '../../theme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'disabled';

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  /** Visual style of the button. Defaults to `primary`. */
  variant?: ButtonVariant;
  /** Button label. */
  title: string;
  /** Stretches the button to fill the available width. */
  fullWidth?: boolean;
  /** Disables interaction; also forces the `disabled` visual treatment. */
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Themed button supporting the four design-system variants. Uses Poppins 600
 * for the label. Shadows are applied per-platform (elevation on Android,
 * shadow* props on iOS) since RN does not share a shadow API across platforms.
 */
export function Button({
  variant = 'primary',
  title,
  fullWidth = false,
  disabled = false,
  style,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || variant === 'disabled';
  const effectiveVariant: ButtonVariant = isDisabled ? 'disabled' : variant;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        containerStyles[effectiveVariant],
        effectiveVariant === 'primary' && shadow,
        fullWidth && styles.fullWidth,
        pressed && !isDisabled && pressedStyles[effectiveVariant],
        style,
      ]}
      {...rest}
    >
      {effectiveVariant === 'ghost' ? (
        <View style={styles.ghostInner}>
          <RNText style={[styles.label, labelStyles[effectiveVariant]]}>{title}</RNText>
        </View>
      ) : (
        <RNText style={[styles.label, labelStyles[effectiveVariant]]}>{title}</RNText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.md,
    paddingVertical: Spacing.md + 2,
    paddingHorizontal: Spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  ghostInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: FontFamily.poppins.semibold,
    fontSize: 15,
    ...Platform.select({ android: { includeFontPadding: false }, default: {} }),
  },
});

const containerStyles = StyleSheet.create({
  primary: {
    backgroundColor: Colors.tangerine,
  },
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Colors.navy,
  },
  ghost: {
    backgroundColor: 'transparent',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  disabled: {
    backgroundColor: Colors.cream,
  },
});

const pressedStyles = StyleSheet.create({
  primary: {
    backgroundColor: Colors.ember,
  },
  secondary: {
    backgroundColor: Colors.skyTint,
  },
  ghost: {
    opacity: 0.6,
  },
  disabled: {},
});

const labelStyles = StyleSheet.create({
  primary: {
    color: Colors.white,
  },
  secondary: {
    color: Colors.navy,
  },
  ghost: {
    color: Colors.inkSoft,
    textDecorationLine: 'underline',
  },
  disabled: {
    color: Colors.subtle,
  },
});

const shadow = Platform.select<ViewStyle>({
  ios: {
    shadowColor: Colors.tangerine,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.32,
    shadowRadius: 14,
  },
  android: {
    elevation: 4,
  },
  default: {},
});
