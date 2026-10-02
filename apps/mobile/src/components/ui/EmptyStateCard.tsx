import { StyleSheet, View } from 'react-native';

import { Colors, Spacing } from '../../theme';
import { Card, Text } from '../ui';
import type { EmptyStateCardProps } from '../../types/empty-state.types';

export function EmptyStateCard({ title, message }: EmptyStateCardProps) {
  return (
    <Card style={styles.card}>
      <View style={styles.content}>
        {title ? (
          <Text variant="bodyMedium" style={styles.title}>
            {title}
          </Text>
        ) : null}
        <Text variant="body" color={Colors.inkSoft} style={styles.message}>
          {message}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: Spacing.sm,
  },
  content: {
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
  },
  title: {
    marginBottom: Spacing.xs,
  },
  message: {
    lineHeight: 22,
  },
});
