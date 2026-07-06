import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { ApiError } from '../../src/api';
import { OtpInput } from '../../src/components/auth/OtpInput';
import { BrandLogo } from '../../src/components/brand/BrandLogo';
import { Screen } from '../../src/components/layout/Screen';
import { Button, Text } from '../../src/components/ui';
import { APP_CONSTANTS, ROUTES } from '../../src/constants';
import { useSendOtp, useVerifyOtp } from '../../src/hooks/auth';
import { useOnboardingStore } from '../../src/stores/onboarding.store';
import { Colors, Spacing } from '../../src/theme';
import { formatIndianPhoneDisplay } from '../../src/utils/phone';
import { resolveAuthenticatedRoute } from '../../src/utils/user';

export default function VerifyOtpScreen() {
  const phone = useOnboardingStore((s) => s.phone);
  const devOtp = useOnboardingStore((s) => s.devOtp);
  const setOnboardingToken = useOnboardingStore((s) => s.setOnboardingToken);

  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [resendCooldownSeconds, setResendCooldownSeconds] = useState(0);

  const verifyOtp = useVerifyOtp();
  const resendOtp = useSendOtp();

  useEffect(() => {
    if (resendCooldownSeconds <= 0) {
      return;
    }

    const timerId = setTimeout(() => {
      setResendCooldownSeconds((current) => Math.max(current - 1, 0));
    }, 1000);

    return () => clearTimeout(timerId);
  }, [resendCooldownSeconds]);

  useEffect(() => {
    if (!phone) {
      router.replace(ROUTES.auth.login);
    }
  }, [phone]);

  useEffect(() => {
    if (devOtp) {
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
          router.replace(resolveAuthenticatedRoute(data.user));
        },
        onError: (err) => {
          setError(err instanceof ApiError ? err.message : 'Invalid code. Try again.');
        },
      },
    );
  };

  const handleResend = () => {
    if (!phone || resendCooldownSeconds > 0) {
      return;
    }
    setError(null);
    resendOtp.mutate(
      { phone },
      {
        onSuccess: (data) => {
          useOnboardingStore.getState().setDevOtp(data.devOtp ?? null);
          setResendCooldownSeconds(APP_CONSTANTS.otpResendCooldownSeconds);
        },
        onError: (err) => {
          setError(err instanceof ApiError ? err.message : 'Could not resend OTP.');
        },
      },
    );
  };

  const resendLabel =
    resendCooldownSeconds > 0
      ? `Resend in ${resendCooldownSeconds}s`
      : resendOtp.isPending
        ? 'Resending…'
        : 'Resend code';

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
            <BrandLogo size={72} style={styles.logo} />
            <Text variant="label">Verification</Text>
            <Text variant="h1" style={styles.title}>
              Enter the code
            </Text>
            <Text variant="body" color={Colors.inkSoft} style={styles.subtitle}>
              Sent to {formatIndianPhoneDisplay(phone)}
            </Text>
          </View>

          <OtpInput value={otp} onChange={setOtp} error={error ?? undefined} />

          {devOtp ? (
            <Text variant="caption" color={Colors.sky} style={styles.devHint}>
              Your code: {devOtp}
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
            title={resendLabel}
            disabled={resendOtp.isPending || resendCooldownSeconds > 0}
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
    alignItems: 'center',
  },
  logo: {
    marginBottom: Spacing.lg,
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
