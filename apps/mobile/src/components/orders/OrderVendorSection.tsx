import { memo } from 'react';
import { StyleSheet } from 'react-native';

import { Colors, Spacing } from '../../theme';
import type { OrderVendorSectionProps } from '../../types';
import { formatInr } from '../../utils';
import { Card, Text } from '../ui';
import { FulfilmentStepper } from './FulfilmentStepper';
import { OrderItemRow } from './OrderItemRow';

function OrderVendorSectionComponent({ group }: OrderVendorSectionProps) {
  return (
    <Card>
      <Text variant="bodyMedium">{group.shopName}</Text>
      <FulfilmentStepper status={group.status} />
      {group.items.map((item) => (
        <OrderItemRow key={item.id} item={item} />
      ))}
      <Text variant="caption" color={Colors.inkSoft} style={styles.meta}>
        Subtotal {formatInr(group.subtotal)}
      </Text>
      <Text variant="caption" color={Colors.inkSoft}>
        Loading / unloading {formatInr(group.loadingUnloadingFee)}
      </Text>
    </Card>
  );
}

export const OrderVendorSection = memo(OrderVendorSectionComponent);

const styles = StyleSheet.create({
  meta: {
    marginTop: Spacing.md,
  },
});
