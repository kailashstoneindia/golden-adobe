import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Colors, Spacing } from '../../theme';
import type { OrderItemRowProps } from '../../types';
import { formatInr } from '../../utils';
import { Text } from '../ui';

function OrderItemRowComponent({ item }: OrderItemRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.main}>
        <Text variant="bodyMedium" numberOfLines={2}>
          {item.productName}
        </Text>
        <Text variant="caption" color={Colors.inkSoft}>
          {item.productCode} · Qty {item.quantity}
        </Text>
      </View>
      <Text variant="numericSm">{formatInr(item.unitPriceSnapshot * item.quantity)}</Text>
    </View>
  );
}

export const OrderItemRow = memo(OrderItemRowComponent);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.line,
  },
  main: {
    flex: 1,
    gap: Spacing.xs,
  },
});
