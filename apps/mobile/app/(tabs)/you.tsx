import { Role } from '@golden-abode/types';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { MenuRow } from '../../src/components/demo/MenuRow';
import { Screen } from '../../src/components/layout/Screen';
import { Badge, Text } from '../../src/components/ui';
import { ERROR_MESSAGES, ROUTES, TOAST_MESSAGES } from '../../src/constants';
import { useAuth } from '../../src/hooks/auth';
import { useLogout } from '../../src/hooks/auth/useLogout';
import { useToast } from '../../src/hooks/useToast';
import { Colors, Radius, Spacing } from '../../src/theme';
import { formatRoleLabel, requiresAdminApproval } from '../../src/utils';

const MENU_ROUTES = [
  { label: 'My Projects', route: ROUTES.screens.myProjects },
  { label: 'Order History', route: ROUTES.screens.orderHistory },
  { label: 'Hired Ustaads', route: ROUTES.screens.hireRequests },
  { label: 'Saved Addresses', route: ROUTES.screens.savedAddresses },
  { label: 'Help & Support', route: ROUTES.screens.helpSupport },
] as const;

const ARTISAN_MENU_ROUTES = [
  { label: 'Ustaad Profile', route: ROUTES.screens.artisanProfile },
  { label: 'My Team', route: ROUTES.screens.artisanTeam },
  { label: 'Bank Details', route: ROUTES.screens.artisanBank },
  { label: 'Help & Support', route: ROUTES.screens.helpSupport },
] as const;

export default function YouTabScreen() {
  const { user } = useAuth();
  const logout = useLogout();
  const { showSuccess, showError } = useToast();
  const isArtisan = user?.role === Role.ARTISAN;
  const menuRoutes = isArtisan ? ARTISAN_MENU_ROUTES : MENU_ROUTES;
  const profileRoute = isArtisan ? ROUTES.screens.artisanProfile : ROUTES.screens.myProjects;

  const initials = user?.name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const handleLogout = async () => {
    try {
      await logout.mutateAsync();
      showSuccess(TOAST_MESSAGES.logoutSuccess);
      router.replace(ROUTES.auth.login);
    } catch {
      showError(ERROR_MESSAGES.generic);
    }
  };

  return (
    <Screen edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Pressable style={styles.profileRow} onPress={() => router.push(profileRoute)}>
          <View style={styles.avatar}>
            <Text variant="h2" color={Colors.ember}>
              {initials ?? '?'}
            </Text>
          </View>
          <View>
            <Text variant="h3">{user?.name ?? 'Guest'}</Text>
            <Text variant="caption">{user?.phone ?? ''}</Text>
            {user?.role ? (
              <View style={styles.metaRow}>
                <Text variant="caption">{formatRoleLabel(user.role)}</Text>
                {requiresAdminApproval(user) ? (
                  <Badge
                    label={user.isApproved ? 'Verified' : 'Pending approval'}
                    variant={user.isApproved ? 'success' : 'pending'}
                  />
                ) : null}
              </View>
            ) : null}
          </View>
        </Pressable>

        <View style={styles.menu}>
          {menuRoutes.map((item) => (
            <MenuRow key={item.label} label={item.label} onPress={() => router.push(item.route)} />
          ))}

          <MenuRow label="Log out" destructive disabled={logout.isPending} onPress={handleLogout} />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  content: {
    paddingHorizontal: Spacing.lg + 2,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: Radius.full,
    backgroundColor: Colors.tangerineTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menu: {
    marginTop: Spacing.xl,
    gap: Spacing.sm + 2,
  },
});
