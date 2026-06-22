import { useRef } from 'react';
import { Platform, Pressable, StyleSheet, TextInput as RNTextInput, View } from 'react-native';

import { Colors, Radius, Spacing } from '../../theme';
import { Text } from '../ui';

const OTP_LENGTH = 6;

export interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

/**
 * Six-digit OTP entry — single hidden input with visual boxes.
 */
export function OtpInput({ value, onChange, error }: OtpInputProps) {
  const inputRef = useRef<RNTextInput>(null);
  const digits = value.padEnd(OTP_LENGTH, ' ').split('').slice(0, OTP_LENGTH);

  return (
    <View>
      <Pressable style={styles.boxRow} onPress={() => inputRef.current?.focus()}>
        {digits.map((digit, index) => (
          <View
            key={index}
            style={[
              styles.box,
              index === value.length ? styles.boxActive : null,
              error ? styles.boxError : null,
            ]}
          >
            <Text variant="numericSm">{digit.trim()}</Text>
          </View>
        ))}
      </Pressable>
      <RNTextInput
        ref={inputRef}
        value={value}
        onChangeText={(text) => onChange(text.replace(/\D/g, '').slice(0, OTP_LENGTH))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={OTP_LENGTH}
        style={styles.hiddenInput}
        caretHidden
      />
      {error ? (
        <Text variant="caption" color={Colors.brick} style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  boxRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  box: {
    flex: 1,
    aspectRatio: 0.85,
    maxWidth: 48,
    borderWidth: 1.5,
    borderColor: Colors.line,
    borderRadius: Radius.sm,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxActive: {
    borderColor: Colors.sky,
  },
  boxError: {
    borderColor: Colors.brick,
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    height: 0,
    width: 0,
    ...Platform.select({ default: {}, android: {} }),
  },
  error: {
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
});
