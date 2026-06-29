import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { DemoScreen } from '../../src/components/demo/DemoScreen';
import { Button, Card, Text } from '../../src/components/ui';
import { ROUTES } from '../../src/constants';
import { DEMO_CART_GROUPS } from '../../src/data/demo-content';
import { Colors, Spacing } from '../../src/theme';

export default function CartTabScreen() {
  const grandTotal = '₹5,380';

  return (
    <DemoScreen
      title="Your cart"
      subtitle="Items grouped by vendor before checkout"
      footer={
        <View style={styles.footer}>
          <View style={styles.totalRow}>
            <Text variant="bodyMedium">Total</Text>
            <Text variant="numeric">{grandTotal}</Text>
          </View>
          <Button title="Proceed to checkout" fullWidth onPress={() => router.push(ROUTES.screens.checkout)} />
        </View>
      }
    >
      {DEMO_CART_GROUPS.map((group) => (
        <View key={group.vendor} style={styles.group}>
          <Text variant="label" color={Colors.tangerine}>
            {group.vendor}
          </Text>
          <Card>
            {group.items.map((item) => (
              <View key={item.name} style={styles.itemRow}>
                <View style={styles.itemInfo}>
                  <Text variant="bodyMedium">{item.name}</Text>
                  <Text variant="caption" color={Colors.inkSoft}>
                    {item.qty}
                  </Text>
                </View>
                <Text variant="numericSm">{item.price}</Text>
              </View>
            ))}
            <View style={styles.subtotalRow}>
              <Text variant="caption">Subtotal</Text>
              <Text variant="numericSm">{group.subtotal}</Text>
            </View>
          </Card>
        </View>
      ))}
    </DemoScreen>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: Spacing.sm,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  itemInfo: {
    flex: 1,
    gap: 2,
  },
  subtotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.line,
  },
  footer: {
    gap: Spacing.md,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
