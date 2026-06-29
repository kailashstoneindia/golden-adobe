import { Pressable, StyleSheet, View } from 'react-native';

import { Card, Text } from '../ui';
import { Colors, Spacing } from '../../theme';

interface MenuRowProps {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

export function MenuRow({ label, onPress, destructive, disabled }: MenuRowProps) {
  return (
    <Pressable onPress={onPress} disabled={disabled}>
      <Card style={styles.card}>
        <View style={styles.row}>
          <Text variant="bodyMedium" color={destructive ? Colors.brick : undefined}>
            {label}
          </Text>
          <Text variant="bodyMedium" color={Colors.subtle}>
            ›
          </Text>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingVertical: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
