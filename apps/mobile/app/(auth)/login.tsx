import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { PhoneInput } from '../../src/components/auth/PhoneInput';
import { Screen } from '../../src/components/layout/Screen';
import { Button, Text } from '../../src/components/ui';
import { ROUTES } from '../../src/constants';
import { useSendOtp } from '../../src/hooks/auth';
import { useOnboardingStore } from '../../src/stores/onboarding.store';
import { Colors, Spacing } from '../../src/theme';
import { ApiError } from '../../src/api';
import { isValidIndianMobile, toE164 } from '../../src/utils/phone';

export default function LoginScreen() {
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);

  const setStoredPhone = useOnboardingStore((s) => s.setPhone);
  const setDevOtp = useOnboardingStore((s) => s.setDevOtp);
  const sendOtp = useSendOtp();

  const handleSendOtp = () => {
    setError(null);

    if (!isValidIndianMobile(phone)) {
      setError('Enter a valid 10-digit mobile number');
      return;
    }

    const e164 = toE164(phone);

    sendOtp.mutate(
      { phone: e164 },
      {
        onSuccess: (data) => {
          setStoredPhone(e164);
          setDevOtp(data.devOtp ?? null);
          router.push(ROUTES.auth.verifyOtp);
        },
        onError: (err) => {
          setError(err instanceof ApiError ? err.message : 'Could not send OTP. Try again.');
        },
      },
    );
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text variant="label">Welcome</Text>
            <Text variant="h1" style={styles.title}>
              Let&apos;s verify it&apos;s you
            </Text>
            <Text variant="body" color={Colors.inkSoft} style={styles.subtitle}>
              We&apos;ll text a 6-digit code to confirm your number.
            </Text>
          </View>

          <PhoneInput
            value={phone}
            onChangeText={(text) => {
              setPhone(text.replace(/\D/g, '').slice(0, 10));
              setError(null);
            }}
            error={error ?? undefined}
          />

          <Button
            title="Send OTP"
            fullWidth
            disabled={sendOtp.isPending}
            onPress={handleSendOtp}
            style={styles.button}
          />

          <Text variant="caption" color={Colors.subtle} style={styles.terms}>
            By continuing you agree to our Terms & Privacy Policy
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xxxl,
    paddingBottom: Spacing.xxl,
  },
  header: {
    marginBottom: Spacing.xxl + 4,
  },
  title: {
    marginTop: Spacing.sm,
  },
  subtitle: {
    marginTop: Spacing.sm,
    fontSize: 13.5,
  },
  button: {
    marginTop: Spacing.xl + 2,
  },
  terms: {
    textAlign: 'center',
    marginTop: Spacing.lg,
    fontSize: 11.5,
  },
});
