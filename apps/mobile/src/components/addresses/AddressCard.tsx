import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Colors, Spacing } from '../../theme';
import type { AddressCardProps } from '../../types';
import { Card, Text } from '../ui';

function AddressCardComponent({
  address,
  isSelected = false,
  onPress,
  onEdit,
  onDelete,
}: AddressCardProps) {
  return (
    <Pressable onPress={onPress} disabled={!onPress}>
      <Card style={isSelected ? styles.selected : undefined}>
        <Text variant="bodyMedium">{address.label}</Text>
        <Text variant="caption" color={Colors.inkSoft} style={styles.meta}>
          {formatAddressLines(address.addressLine1, address.addressLine2)}
        </Text>
        <Text variant="caption" color={Colors.inkSoft}>
          {address.city} {address.pincode}
        </Text>
        {address.isDefault ? (
          <Text variant="caption" color={Colors.sage} style={styles.meta}>
            Default
          </Text>
        ) : null}
        {onEdit || onDelete ? (
          <View style={styles.actions}>
            {onEdit ? (
              <Pressable onPress={onEdit}>
                <Text variant="caption" color={Colors.sky}>
                  Edit
                </Text>
              </Pressable>
            ) : null}
            {onDelete ? (
              <Pressable onPress={onDelete}>
                <Text variant="caption" color={Colors.brick}>
                  Delete
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </Card>
    </Pressable>
  );
}

function formatAddressLines(line1: string, line2: string | null): string {
  if (!line2) {
    return line1;
  }
  return `${line1}, ${line2}`;
}

export const AddressCard = memo(AddressCardComponent);

const styles = StyleSheet.create({
  selected: {
    borderWidth: 1.5,
    borderColor: Colors.navy,
  },
  meta: {
    marginTop: Spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
});
