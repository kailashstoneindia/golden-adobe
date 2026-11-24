import { memo } from 'react';
import { StyleSheet } from 'react-native';

import { Colors, Spacing } from '../../theme';
import type { OrderVendorSectionProps } from '../../types';
import { formatInr } from '../../utils';
import { DeliveryCodeCard } from '../delivery/DeliveryCodeCard';
import { Card, Text } from '../ui';
import { FulfilmentStepper } from './FulfilmentStepper';
import { OrderItemRow } from './OrderItemRow';

function OrderVendorSectionComponent({ group, audience = 'other' }: OrderVendorSectionProps) {
  // The code exists only while out for delivery; never show a stale one.
  const deliveryCode = group.status === 'shipped' ? group.deliveryOtp : null;
  return (
    <Card>
      <Text variant="bodyMedium">{group.shopName}</Text>
      <FulfilmentStepper status={group.status} audience={audience} />
      {deliveryCode ? <DeliveryCodeCard code={deliveryCode} /> : null}
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
