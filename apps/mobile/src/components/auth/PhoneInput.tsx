import { forwardRef } from 'react';
import { Platform, StyleSheet, TextInput as RNTextInput, View } from 'react-native';

import { Colors, FontFamily, Radius, Spacing } from '../../theme';
import { INDIA_COUNTRY_CODE } from '../../utils/phone';
import { Text } from '../ui';

export interface PhoneInputProps {
  label?: string;
  value: string;
  onChangeText: (value: string) => void;
  error?: string;
  placeholder?: string;
}

/**
 * Indian mobile input with a fixed +91 prefix box (design doc § Phone login).
 */
export const PhoneInput = forwardRef<RNTextInput, PhoneInputProps>(function PhoneInput(
  { label = 'Mobile number', value, onChangeText, error, placeholder = '98290 12345' },
  ref,
) {
  return (
    <View style={styles.wrapper}>
      {label ? (
        <Text variant="caption" style={styles.label}>
          {label}
        </Text>
      ) : null}
      <View style={styles.row}>
        <View style={styles.prefix}>
          <Text variant="numericSm">{INDIA_COUNTRY_CODE}</Text>
        </View>
        <RNTextInput
          ref={ref}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={Colors.subtle}
          keyboardType="phone-pad"
          maxLength={10}
          style={[styles.input, error ? styles.inputError : null]}
        />
      </View>
      {error ? (
        <Text variant="caption" color={Colors.brick} style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  label: {
    marginBottom: Spacing.xs + 2,
    color: Colors.inkSoft,
    fontFamily: FontFamily.inter.semibold,
    fontSize: 12,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  prefix: {
    width: 54,
    borderWidth: 1.5,
    borderColor: Colors.line,
    borderRadius: Radius.sm,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
  },
  input: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: Colors.line,
    borderRadius: Radius.sm,
    backgroundColor: Colors.white,
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
  inputError: {
    borderColor: Colors.brick,
  },
  error: {
    marginTop: Spacing.xs + 2,
  },
});
