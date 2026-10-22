import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ORDER_STATUS_LABELS } from '../../constants';
import { Colors, Spacing } from '../../theme';
import type { OrderListRowProps } from '../../types';
import { formatInr } from '../../utils';
import { Badge, Card, Text } from '../ui';
import type { BadgeVariant } from '../ui';
import type { OrderStatus } from '@golden-abode/types';
import { ORDER_STATUSES } from '@golden-abode/types';

function OrderListRowComponent({ order, onPress }: OrderListRowProps) {
  const handlePress = useCallback(() => onPress(order.id), [onPress, order.id]);

  return (
    <Pressable onPress={handlePress}>
      <Card>
        <View style={styles.header}>
          <Text variant="bodyMedium">Order {order.id.slice(0, 8)}</Text>
          <Badge label={ORDER_STATUS_LABELS[order.status]} variant={toBadgeVariant(order.status)} />
        </View>
        <Text variant="caption" color={Colors.inkSoft} style={styles.meta}>
          {formatInr(order.grandTotal)} · {order.vendorGroups.length} shop
          {order.vendorGroups.length === 1 ? '' : 's'}
        </Text>
      </Card>
    </Pressable>
  );
}

function toBadgeVariant(status: OrderStatus): BadgeVariant {
  if (status === ORDER_STATUSES.CONFIRMED) {
    return 'success';
  }
  if (status === ORDER_STATUSES.CANCELLED || status === ORDER_STATUSES.REFUNDED) {
    return 'error';
  }
  return 'pending';
}

export const OrderListRow = memo(OrderListRowComponent);

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  meta: {
    marginTop: Spacing.xs,
  },
});
