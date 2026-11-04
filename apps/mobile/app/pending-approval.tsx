import { Role } from '@golden-abode/types';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { Screen } from '../src/components/layout/Screen';
import { Badge, Button, Text } from '../src/components/ui';
import { QUERY_KEYS, ROUTES, TRADE_TYPE_LABELS } from '../src/constants';
import { useArtisanOnboardingStatus, useArtisanProfileQuery } from '../src/hooks/artisans';
import { useAuth, useMe } from '../src/hooks/auth';
import { useLogout } from '../src/hooks/auth/useLogout';
import { Colors, Spacing } from '../src/theme';
import { formatRoleLabel, isPendingApproval, needsVendorOnboarding } from '../src/utils/user';

const APPROVAL_POLL_INTERVAL_MS = 15_000;

export default function PendingApprovalScreen() {
  const { isAuthenticated, isHydrated, user } = useAuth();
  // Poll so approval shows up without the user tapping "Check status".
  const me = useMe(APPROVAL_POLL_INTERVAL_MS);
  const queryClient = useQueryClient();
  const logout = useLogout();
  const artisanOnboarding = useArtisanOnboardingStatus(user);
  const isArtisan = user?.role === Role.ARTISAN;
  const artisanProfile = useArtisanProfileQuery(isArtisan).data;

  useEffect(() => {
    if (!isHydrated) return;

    if (!isAuthenticated) {
      router.replace(ROUTES.auth.login);
      return;
    }

    if (user && needsVendorOnboarding(user)) {
      router.replace(ROUTES.vendorOnboard);
      return;
    }

    if (artisanOnboarding.needsOnboarding) {
      router.replace(ROUTES.artisanOnboard);
      return;
    }

    if (user && !isPendingApproval(user)) {
      router.replace(ROUTES.home);
    }
  }, [artisanOnboarding.needsOnboarding, isAuthenticated, isHydrated, user]);

  const handleCheckStatus = async () => {
    const result = await me.refetch();
    if (isArtisan) {
      // Approval and verification land together; refresh the profile so the
      // Ustaad home does not keep showing "Verification pending".
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.artisan.profile() });
    }
    if (result.data && !isPendingApproval(result.data)) {
      router.replace(ROUTES.home);
    }
  };

  const handleLogout = async () => {
    await logout.mutateAsync();
    router.replace(ROUTES.auth.login);
  };

  if (!isHydrated || !user || !isPendingApproval(user)) {
    return null;
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text variant="label">Almost ready</Text>
          <Text variant="h1" style={styles.title}>
            Pending admin approval
          </Text>
          <Badge label="Pending approval" variant="pending" />
        </View>

        <Text variant="body" color={Colors.inkSoft}>
          Your {formatRoleLabel(user.role).toLowerCase()} profile is under review. An admin will
          verify your account before you can{' '}
          {isArtisan ? 'take on jobs from customers' : 'list inventory or take on projects'}.
        </Text>

        <View style={styles.details}>
          <Text variant="bodyMedium">{user.name}</Text>
          <Text variant="caption">{user.phone}</Text>
          {user.vendorProfile ? (
            <>
              <Text variant="bodyMedium" style={styles.shopName}>
                {user.vendorProfile.shopName}
              </Text>
              <Text variant="caption">{user.vendorProfile.address}</Text>
            </>
          ) : null}
          {isArtisan && artisanProfile ? (
            <Text variant="bodyMedium" style={styles.shopName}>
              {TRADE_TYPE_LABELS[artisanProfile.tradeType]}
              {artisanProfile.servicePincode ? ` · ${artisanProfile.servicePincode}` : ''}
            </Text>
          ) : null}
        </View>

        <Button
          title={me.isFetching ? 'Checking…' : 'Check status'}
          fullWidth
          disabled={me.isFetching}
          onPress={handleCheckStatus}
        />

        <Button
          variant="ghost"
          title="Log out"
          fullWidth
          disabled={logout.isPending}
          onPress={handleLogout}
          style={styles.logout}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xxxl,
    paddingBottom: Spacing.xxl,
    gap: Spacing.lg,
  },
  header: {
    gap: Spacing.sm,
  },
  title: {
    marginTop: Spacing.xs,
  },
  details: {
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
  },
  shopName: {
    marginTop: Spacing.sm,
  },
  logout: {
    marginTop: Spacing.sm,
  },
});
