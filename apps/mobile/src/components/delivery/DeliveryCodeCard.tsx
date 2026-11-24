import { StyleSheet, View } from 'react-native';

import { Colors, Radius, Spacing } from '../../theme';
import { Text } from '../ui';

/**
 * The customer's proof-of-delivery code (decision 0060). Present only while
 * the group is out for delivery; it changes on a re-attempt, so it is always
 * rendered from the latest fetch.
 */
export function DeliveryCodeCard({ code }: Readonly<{ code: string }>) {
  return (
    <View style={styles.card}>
      <Text variant="caption" color={Colors.navy}>
        Tell the driver this code when your order arrives
      </Text>
      <Text
        variant="h1"
        color={Colors.navy}
        style={styles.code}
        accessibilityLabel={`Delivery code ${code.split('').join(' ')}`}
      >
        {code}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.skyTint,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  code: {
    letterSpacing: 6,
  },
});
