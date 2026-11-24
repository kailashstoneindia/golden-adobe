import type { DeliveryJobDto } from '@golden-abode/types';
import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { DELIVERY_JOB_STATUS_LABELS } from '../../constants';
import { Colors, Spacing } from '../../theme';
import { toDeliveryJobBadgeVariant } from '../../utils/delivery';
import { Badge, Card, Text } from '../ui';

type DeliveryJobRowProps = {
  job: DeliveryJobDto;
  onPress: (jobId: string) => void;
};

function DeliveryJobRowComponent({ job, onPress }: DeliveryJobRowProps) {
  const handlePress = useCallback(() => onPress(job.id), [job.id, onPress]);

  return (
    <Pressable onPress={handlePress} accessibilityRole="button">
      <Card style={styles.card}>
        <View style={styles.header}>
          <Text variant="bodyMedium">{job.orderNumber}</Text>
          <Badge
            label={job.blocked ? 'STOP' : DELIVERY_JOB_STATUS_LABELS[job.status]}
            variant={job.blocked ? 'error' : toDeliveryJobBadgeVariant(job.status)}
          />
        </View>
        <Text variant="caption" color={Colors.inkSoft}>
          From {job.pickup.vendorName} · To {job.drop.city} {job.drop.pincode}
        </Text>
        <View style={styles.meta}>
          <Text variant="caption" color={Colors.inkSoft}>
            {job.items.length} item{job.items.length === 1 ? '' : 's'}
          </Text>
          {job.attemptNo > 1 ? (
            <Badge label={`Attempt ${job.attemptNo}`} variant="pending" />
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}

export const DeliveryJobRow = memo(DeliveryJobRowComponent);

const styles = StyleSheet.create({
  card: { gap: Spacing.xs },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
});
