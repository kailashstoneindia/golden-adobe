import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Role } from '@golden-abode/types';

import { RoleCard, type RoleOption } from '../../src/components/auth/RoleCard';
import { Screen } from '../../src/components/layout/Screen';
import { Button, Text, TextInput } from '../../src/components/ui';
import { ROUTES } from '../../src/constants';
import { useRegister } from '../../src/hooks/auth';
import { useOnboardingStore } from '../../src/stores/onboarding.store';
import { Colors, Spacing } from '../../src/theme';
import { ApiError } from '../../src/api';

const ROLE_OPTIONS: RoleOption[] = [
  {
    role: Role.CUSTOMER,
    title: 'Customer',
    description: 'Browse materials, place orders, and hire Ustaads for your project.',
  },
  {
    role: Role.VENDOR,
    title: 'Vendor',
    description: 'Manage your shop catalog, stock, and incoming orders.',
  },
  {
    role: Role.ARTISAN,
    title: 'Ustaad (Artisan)',
    description: 'Validate deliveries on site and earn reward points.',
  },
];

export default function RegisterScreen() {
  const onboardingToken = useOnboardingStore((s) => s.onboardingToken);
  const clearOnboarding = useOnboardingStore((s) => s.clear);

  const [name, setName] = useState('');
  const [role, setRole] = useState<Role.CUSTOMER | Role.VENDOR | Role.ARTISAN>(Role.CUSTOMER);
  const [error, setError] = useState<string | null>(null);

  const register = useRegister();

  useEffect(() => {
    if (!onboardingToken) {
      router.replace(ROUTES.auth.login);
    }
  }, [onboardingToken]);

  const handleRegister = () => {
    if (!onboardingToken) return;
    setError(null);

    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      setError('Please enter your full name');
      return;
    }

    register.mutate(
      { onboardingToken, name: trimmedName, role },
      {
        onSuccess: (data) => {
          clearOnboarding();
          router.replace(ROUTES.home);
        },
        onError: (err) => {
          setError(err instanceof ApiError ? err.message : 'Registration failed. Try again.');
        },
      },
    );
  };

  if (!onboardingToken) {
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
            <Text variant="label">Almost there</Text>
            <Text variant="h1" style={styles.title}>
              Create your profile
            </Text>
            <Text variant="body" color={Colors.inkSoft}>
              Tell us your name and how you&apos;ll use Kailash Stones.
            </Text>
          </View>

          <TextInput
            label="Full name"
            placeholder="Rajesh Kumar"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            error={error && name.trim().length < 2 ? error : undefined}
          />

          <Text variant="h3" style={styles.roleHeading}>
            I am a…
          </Text>

          <View style={styles.roles}>
            {ROLE_OPTIONS.map((option) => (
              <RoleCard
                key={option.role}
                option={option}
                selected={role === option.role}
                onSelect={setRole}
              />
            ))}
          </View>

          {error && name.trim().length >= 2 ? (
            <Text variant="caption" color={Colors.brick} style={styles.formError}>
              {error}
            </Text>
          ) : null}

          <Button
            title="Get started"
            fullWidth
            disabled={register.isPending}
            onPress={handleRegister}
            style={styles.button}
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
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.xxl,
    gap: Spacing.lg,
  },
  header: {
    gap: Spacing.sm,
  },
  title: {
    marginTop: Spacing.xs,
  },
  roleHeading: {
    marginTop: Spacing.sm,
  },
  roles: {
    gap: Spacing.md,
  },
  formError: {
    textAlign: 'center',
  },
  button: {
    marginTop: Spacing.sm,
  },
});
