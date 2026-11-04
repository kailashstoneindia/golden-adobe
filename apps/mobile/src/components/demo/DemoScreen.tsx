import { router } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Screen } from '../layout/Screen';
import { Text } from '../ui';
import { Colors, Spacing } from '../../theme';

interface DemoScreenProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  footer?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  /** Enables pull-to-refresh; the spinner shows until the promise settles. */
  onRefresh?: () => Promise<unknown>;
  children: ReactNode;
}

export function DemoScreen({
  title,
  subtitle,
  showBack = false,
  footer,
  contentStyle,
  onRefresh,
  children,
}: DemoScreenProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    if (!onRefresh) {
      return;
    }
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  }, [onRefresh]);

  return (
    <Screen edges={['top']}>
      <View style={styles.root}>
        {showBack ? (
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
            <Text variant="bodyMedium" color={Colors.sky}>
              ‹ Back
            </Text>
          </Pressable>
        ) : null}

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, contentStyle]}
          showsVerticalScrollIndicator={false}
          // Keeps the focused field above the keyboard on iOS; Android
          // resizes the window instead.
          automaticallyAdjustKeyboardInsets
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor={Colors.navy}
                colors={[Colors.navy]}
              />
            ) : undefined
          }
        >
          <Text variant="h1" style={styles.title}>
            {title}
          </Text>
          {subtitle ? (
            <Text variant="caption" color={Colors.inkSoft} style={styles.subtitle}>
              {subtitle}
            </Text>
          ) : null}
          {children}
        </ScrollView>

        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  backBtn: {
    paddingHorizontal: Spacing.lg + 2,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.lg + 2,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xxl,
    gap: Spacing.md,
  },
  title: {
    marginTop: Spacing.xs,
  },
  subtitle: {
    marginTop: -Spacing.sm,
  },
  footer: {
    paddingHorizontal: Spacing.lg + 2,
    paddingVertical: Spacing.lg,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.line,
    gap: Spacing.md,
  },
});
