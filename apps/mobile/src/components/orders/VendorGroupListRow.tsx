import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { VENDOR_GROUP_STATUS_LABELS } from '../../constants';
import { Colors, Spacing } from '../../theme';
import type { VendorGroupListRowProps } from '../../types';
import { formatInr } from '../../utils';
import { Badge, Card, Text } from '../ui';
import type { BadgeVariant } from '../ui';
import type { OrderVendorGroupStatus } from '@golden-abode/types';
import { ORDER_VENDOR_GROUP_STATUSES } from '@golden-abode/types';

function VendorGroupListRowComponent({ group, onPress }: VendorGroupListRowProps) {
  const handlePress = useCallback(() => onPress(group.id), [group.id, onPress]);

  return (
    <Pressable onPress={handlePress}>
      <Card>
        <View style={styles.header}>
          <Text variant="bodyMedium">{group.shopName}</Text>
          <Badge
            label={VENDOR_GROUP_STATUS_LABELS[group.status]}
            variant={toGroupBadgeVariant(group.status)}
          />
        </View>
        <Text variant="caption" color={Colors.inkSoft} style={styles.meta}>
          {formatInr(group.subtotal)} · {group.items.length} item
          {group.items.length === 1 ? '' : 's'}
        </Text>
      </Card>
    </Pressable>
  );
}

function toGroupBadgeVariant(status: OrderVendorGroupStatus): BadgeVariant {
  if (status === ORDER_VENDOR_GROUP_STATUSES.DELIVERED) {
    return 'success';
  }
  if (status === ORDER_VENDOR_GROUP_STATUSES.CANCELLED) {
    return 'error';
  }
  if (status === ORDER_VENDOR_GROUP_STATUSES.SHIPPED) {
    return 'info';
  }
  return 'pending';
}

export const VendorGroupListRow = memo(VendorGroupListRowComponent);

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
