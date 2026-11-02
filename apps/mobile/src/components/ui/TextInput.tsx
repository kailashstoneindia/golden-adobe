import { forwardRef, useId, useState } from 'react';
import {
  InputAccessoryView,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  TextInput as RNTextInput,
  Text as RNText,
  View,
  type StyleProp,
  type TextInputProps as RNTextInputProps,
  type ViewStyle,
} from 'react-native';

import { Colors, FontFamily, Radius, Spacing } from '../../theme';

export interface TextInputProps extends RNTextInputProps {
  /** Optional field label rendered above the input. */
  label?: string;
  /** Optional error message; turns the border and message brick-red. */
  error?: string;
  /** Style for the outer wrapper (label + input). */
  containerStyle?: StyleProp<ViewStyle>;
}

// iOS number and phone pads have no return key, so without an accessory bar
// the keyboard can only be closed by tapping elsewhere.
const KEYBOARDS_WITHOUT_RETURN_KEY = new Set<RNTextInputProps['keyboardType']>([
  'number-pad',
  'decimal-pad',
  'numeric',
  'phone-pad',
]);

/**
 * Themed text field with an optional label. Hairline border by default, sky
 * border on focus, brick border on error. Uses Inter for input text.
 */
export const TextInput = forwardRef<RNTextInput, TextInputProps>(function TextInput(
  { label, error, containerStyle, style, onFocus, onBlur, inputAccessoryViewID, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const generatedAccessoryId = `text-input-done-${useId()}`;
  const needsDoneBar =
    Platform.OS === 'ios' &&
    !inputAccessoryViewID &&
    KEYBOARDS_WITHOUT_RETURN_KEY.has(rest.keyboardType);
  const accessoryId = needsDoneBar ? generatedAccessoryId : inputAccessoryViewID;

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? <RNText style={styles.label}>{label}</RNText> : null}
      <RNTextInput
        ref={ref}
        placeholderTextColor={Colors.subtle}
        style={[
          styles.input,
          focused && styles.inputFocused,
          error ? styles.inputError : null,
          style,
        ]}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        inputAccessoryViewID={accessoryId}
        {...rest}
      />
      {error ? <RNText style={styles.errorText}>{error}</RNText> : null}
      {needsDoneBar ? (
        <InputAccessoryView nativeID={generatedAccessoryId}>
          <View style={styles.doneBar}>
            <Pressable onPress={Keyboard.dismiss} hitSlop={8} accessibilityRole="button">
              <RNText style={styles.doneText}>Done</RNText>
            </Pressable>
          </View>
        </InputAccessoryView>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  label: {
    fontFamily: FontFamily.inter.semibold,
    fontSize: 12,
    color: Colors.inkSoft,
    marginBottom: Spacing.xs + 2,
    ...Platform.select({ android: { includeFontPadding: false }, default: {} }),
  },
  input: {
    width: '100%',
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.line,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md + 2,
    fontFamily: FontFamily.inter.regular,
    fontSize: 15,
    color: Colors.ink,
    ...Platform.select({
      android: { includeFontPadding: false, textAlignVertical: 'center' as const },
      default: {},
    }),
  },
  inputFocused: {
    borderColor: Colors.sky,
  },
  inputError: {
    borderColor: Colors.brick,
  },
  doneBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.cream,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.line,
  },
  doneText: {
    fontFamily: FontFamily.inter.semibold,
    fontSize: 16,
    color: Colors.sky,
  },
  errorText: {
    fontFamily: FontFamily.inter.medium,
    fontSize: 12,
    color: Colors.brick,
    marginTop: Spacing.xs + 2,
    ...Platform.select({ android: { includeFontPadding: false }, default: {} }),
  },
});
