import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Screen } from '../../src/components/layout/Screen';
import { Card, Text } from '../../src/components/ui';
import { ROUTES } from '../../src/constants';
import { useAuth } from '../../src/hooks/auth';
import { useLogout } from '../../src/hooks/auth/useLogout';
import { Colors, Radius, Spacing } from '../../src/theme';

const MENU_ITEMS = [
  'My Projects',
  'Order History',
  'Saved Addresses',
  'Help & Support',
] as const;

export default function YouTabScreen() {
  const { user } = useAuth();
  const logout = useLogout();

  const initials = user?.name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const handleLogout = async () => {
    await logout.mutateAsync();
    router.replace(ROUTES.auth.login);
  };

  return (
    <Screen edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.profileRow}>
          <View style={styles.avatar}>
            <Text variant="h2" color={Colors.ember}>
              {initials ?? '?'}
            </Text>
          </View>
          <View>
            <Text variant="h3">{user?.name ?? 'Guest'}</Text>
            <Text variant="caption">{user?.phone ?? ''}</Text>
          </View>
        </View>

        <View style={styles.menu}>
          {MENU_ITEMS.map((item) => (
            <Card key={item} style={styles.menuItem}>
              <View style={styles.menuRow}>
                <Text variant="bodyMedium">{item}</Text>
                <Text variant="bodyMedium" color={Colors.subtle}>
                  ›
                </Text>
              </View>
            </Card>
          ))}

          <Pressable onPress={handleLogout} disabled={logout.isPending}>
            <Card style={styles.menuItem}>
              <View style={styles.menuRow}>
                <Text variant="bodyMedium" color={Colors.brick}>
                  Log out
                </Text>
                <Text variant="bodyMedium" color={Colors.subtle}>
                  ›
                </Text>
              </View>
            </Card>
          </Pressable>
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
  menuItem: {
    paddingVertical: Spacing.md,
  },
  menuRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
