import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { HIRE_REQUEST_STATUS_LABELS } from '../../constants';
import { Colors, Spacing } from '../../theme';
import type { HireRequestListRowProps } from '../../types';
import { formatShortDate, shortId, toHireRequestBadgeVariant } from '../../utils';
import { Badge, Card, Text } from '../ui';

function HireRequestListRowComponent({ request, onPress }: HireRequestListRowProps) {
  const handlePress = useCallback(() => onPress(request.id), [onPress, request.id]);

  return (
    <Pressable onPress={handlePress}>
      <Card>
        <View style={styles.header}>
          <Text variant="bodyMedium">Job {shortId(request.id)}</Text>
          <Badge
            label={HIRE_REQUEST_STATUS_LABELS[request.status]}
            variant={toHireRequestBadgeVariant(request.status)}
          />
        </View>
        <Text variant="caption" color={Colors.inkSoft} numberOfLines={1} style={styles.meta}>
          {request.addressText}
        </Text>
        <Text variant="caption" color={Colors.inkSoft}>
          Requested {formatShortDate(request.createdAt)}
          {request.latestEstimate
            ? ` · Est. ${request.latestEstimate.estimatedDays} day${request.latestEstimate.estimatedDays === 1 ? '' : 's'}`
            : ''}
        </Text>
      </Card>
    </Pressable>
  );
}

export const HireRequestListRow = memo(HireRequestListRowComponent);

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
