import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Colors, Spacing } from '../../theme';
import type { CartLineRowProps, CartVendorGroupCardProps } from '../../types';
import { cartLineWarning, formatInr } from '../../utils';
import { Card, QtyStepper, Text } from '../ui';

function CartVendorGroupCardComponent({
  group,
  isUpdating,
  isReadOnly = false,
  onIncrease,
  onDecrease,
  onRemove,
}: CartVendorGroupCardProps) {
  return (
    <Card>
      <Text variant="bodyMedium">{group.shopName}</Text>
      <Text variant="caption" color={Colors.inkSoft} style={styles.meta}>
        Subtotal {formatInr(group.subtotal)}
      </Text>
      {group.shortfall > 0 ? (
        <Text variant="caption" color={Colors.brick} style={styles.meta}>
          Add {formatInr(group.shortfall)} more from {group.shopName} to check out
        </Text>
      ) : null}
      {group.items.map((item) => (
        <CartLineRow
          key={item.id}
          item={item}
          isUpdating={isUpdating}
          isReadOnly={isReadOnly}
          onIncrease={onIncrease}
          onDecrease={onDecrease}
          onRemove={onRemove}
        />
      ))}
    </Card>
  );
}

function CartLineRow({
  item,
  isUpdating,
  isReadOnly = false,
  onIncrease,
  onDecrease,
  onRemove,
}: CartLineRowProps) {
  const handleIncrease = useCallback(() => onIncrease(item), [item, onIncrease]);
  const handleDecrease = useCallback(() => onDecrease(item), [item, onDecrease]);
  const handleRemove = useCallback(() => onRemove(item), [item, onRemove]);
  const warning = cartLineWarning(item);

  return (
    <View style={styles.line}>
      <View style={styles.lineMain}>
        <Text variant="bodyMedium" numberOfLines={2}>
          {item.productName}
        </Text>
        <Text variant="caption" color={Colors.inkSoft}>
          {item.productCode} · {formatInr(item.price)}
        </Text>
        {warning ? (
          <Text variant="caption" color={Colors.brick}>
            {warning}
          </Text>
        ) : null}
      </View>
      {isReadOnly ? (
        <Text variant="caption" color={Colors.inkSoft}>
          Qty {item.quantity}
        </Text>
      ) : (
        <View style={styles.lineActions}>
          <QtyStepper
            quantity={item.quantity}
            isDisabled={isUpdating}
            onIncrease={handleIncrease}
            onDecrease={handleDecrease}
          />
          <Pressable onPress={handleRemove} disabled={isUpdating}>
            <Text variant="caption" color={Colors.brick}>
              Remove
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

export const CartVendorGroupCard = memo(CartVendorGroupCardComponent);

const styles = StyleSheet.create({
  meta: {
    marginTop: Spacing.xs,
  },
  line: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.line,
    gap: Spacing.sm,
  },
  lineMain: {
    gap: Spacing.xs,
  },
  lineActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
