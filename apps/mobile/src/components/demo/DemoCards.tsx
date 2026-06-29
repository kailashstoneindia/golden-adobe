import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { DemoOrder } from '../../data/demo-content';
import { Colors, Spacing } from '../../theme';
import { Badge, Card, Text } from '../ui';

interface OrderCardProps {
  order: DemoOrder;
  onPress?: () => void;
  actions?: ReactNode;
}

export function DemoOrderCard({ order, onPress, actions }: OrderCardProps) {
  const content = (
    <Card>
      <View style={styles.cardTop}>
        <Text variant="bodyMedium" style={styles.orderId}>
          #{order.id}
        </Text>
        <Badge label={order.status} variant={order.badge} />
      </View>
      <Text variant="caption" style={styles.meta}>
        {order.customer} · {order.summary}
      </Text>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </Card>
  );

  if (!onPress) return content;

  return <Pressable onPress={onPress}>{content}</Pressable>;
}

interface VendorCardProps {
  name: string;
  subtitle: string;
  onPress?: () => void;
}

export function DemoVendorCard({ name, subtitle, onPress }: VendorCardProps) {
  return (
    <Pressable onPress={onPress} disabled={!onPress}>
      <Card>
        <View style={styles.vendorImg} />
        <Text variant="bodyMedium" style={styles.vendorName}>
          {name}
        </Text>
        <Text variant="caption">{subtitle}</Text>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  orderId: {
    fontSize: 14,
  },
  meta: {
    marginTop: Spacing.xs + 2,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  vendorImg: {
    height: 56,
    borderRadius: 10,
    backgroundColor: Colors.skyTint,
    marginBottom: Spacing.sm,
  },
  vendorName: {
    fontSize: 12.5,
  },
});
