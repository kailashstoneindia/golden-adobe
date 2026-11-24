import { StyleSheet, View } from 'react-native';

import { Colors, Radius, Spacing } from '../../theme';
import { Text } from '../ui';

const DEFAULT_REASON = 'This order was refunded or cancelled. Do not deliver it.';

/** Shown when a job is blocked: the order was refunded or cancelled. */
export function StopBanner({ reason }: Readonly<{ reason: string | null }>) {
  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Text variant="h3" color={Colors.white}>
        STOP
      </Text>
      <Text variant="body" color={Colors.white}>
        {reason ?? DEFAULT_REASON}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: Colors.brick,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    gap: Spacing.xs,
  },
});
