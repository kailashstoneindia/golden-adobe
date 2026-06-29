import { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { Screen } from '../src/components/layout/Screen';
import { Badge, Button, Text } from '../src/components/ui';
import { ROUTES } from '../src/constants';
import { useAuth, useMe } from '../src/hooks/auth';
import { useLogout } from '../src/hooks/auth/useLogout';
import { Colors, Spacing } from '../src/theme';
import { formatRoleLabel, isPendingApproval } from '../src/utils/user';

export default function PendingApprovalScreen() {
  const { isAuthenticated, isHydrated, user } = useAuth();
  const me = useMe();
  const logout = useLogout();

  useEffect(() => {
    if (!isHydrated) return;

    if (!isAuthenticated) {
      router.replace(ROUTES.auth.login);
      return;
    }

    if (user && !isPendingApproval(user)) {
      router.replace(ROUTES.home);
    }
  }, [isAuthenticated, isHydrated, user]);

  const handleCheckStatus = async () => {
    const result = await me.refetch();
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
          verify your account before you can list inventory or take on projects.
        </Text>

        <View style={styles.details}>
          <Text variant="bodyMedium">{user.name}</Text>
          <Text variant="caption">{user.phone}</Text>
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
  logout: {
    marginTop: Spacing.sm,
  },
});
