import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { ApiError } from '../../src/api';
import { OtpInput } from '../../src/components/auth/OtpInput';
import { Screen } from '../../src/components/layout/Screen';
import { Button, Text } from '../../src/components/ui';
import { Env, ROUTES } from '../../src/constants';
import { useSendOtp, useVerifyOtp } from '../../src/hooks/auth';
import { useOnboardingStore } from '../../src/stores/onboarding.store';
import { Colors, Spacing } from '../../src/theme';
import { formatPhoneDisplay } from '../../src/utils/phone';

export default function VerifyOtpScreen() {
  const phone = useOnboardingStore((s) => s.phone);
  const devOtp = useOnboardingStore((s) => s.devOtp);
  const setOnboardingToken = useOnboardingStore((s) => s.setOnboardingToken);

  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);

  const verifyOtp = useVerifyOtp();
  const resendOtp = useSendOtp();

  useEffect(() => {
    if (!phone) {
      router.replace(ROUTES.auth.login);
    }
  }, [phone]);

  useEffect(() => {
    if (Env.isDev && devOtp) {
      setOtp(devOtp);
    }
  }, [devOtp]);

  const handleVerify = () => {
    if (!phone) return;
    setError(null);

    if (otp.length !== 6) {
      setError('Enter the 6-digit code');
      return;
    }

    verifyOtp.mutate(
      { phone, otp },
      {
        onSuccess: (data) => {
          if (data.isNewUser) {
            setOnboardingToken(data.onboardingToken);
            router.replace(ROUTES.auth.register);
            return;
          }
          router.replace(ROUTES.home);
        },
        onError: (err) => {
          setError(err instanceof ApiError ? err.message : 'Invalid code. Try again.');
        },
      },
    );
  };

  const handleResend = () => {
    if (!phone) return;
    setError(null);
    resendOtp.mutate(
      { phone },
      {
        onSuccess: (data) => {
          useOnboardingStore.getState().setDevOtp(data.devOtp ?? null);
        },
        onError: (err) => {
          setError(err instanceof ApiError ? err.message : 'Could not resend OTP.');
        },
      },
    );
  };

  if (!phone) {
    return null;
  }

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
            <Text variant="label">Verification</Text>
            <Text variant="h1" style={styles.title}>
              Enter the code
            </Text>
            <Text variant="body" color={Colors.inkSoft} style={styles.subtitle}>
              Sent to +91 {formatPhoneDisplay(phone)}
            </Text>
          </View>

          <OtpInput value={otp} onChange={setOtp} error={error ?? undefined} />

          {Env.isDev && devOtp ? (
            <Text variant="caption" color={Colors.sky} style={styles.devHint}>
              Dev OTP: {devOtp}
            </Text>
          ) : null}

          <Button
            title="Verify & continue"
            fullWidth
            disabled={verifyOtp.isPending}
            onPress={handleVerify}
            style={styles.button}
          />

          <Button
            variant="ghost"
            title={resendOtp.isPending ? 'Resending…' : 'Resend code'}
            disabled={resendOtp.isPending}
            onPress={handleResend}
            style={styles.resend}
          />
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
  },
  devHint: {
    textAlign: 'center',
    marginTop: Spacing.md,
  },
  button: {
    marginTop: Spacing.xxl,
  },
  resend: {
    alignSelf: 'center',
    marginTop: Spacing.md,
  },
});
