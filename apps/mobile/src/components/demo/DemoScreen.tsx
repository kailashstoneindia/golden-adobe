import { router } from 'expo-router';
import { type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Screen } from '../layout/Screen';
import { Text } from '../ui';
import { Colors, Spacing } from '../../theme';

interface DemoScreenProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  footer?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
}

export function DemoScreen({
  title,
  subtitle,
  showBack = false,
  footer,
  contentStyle,
  children,
}: DemoScreenProps) {
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
  },
});
