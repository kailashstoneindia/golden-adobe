import { ORDER_VENDOR_GROUP_NEXT_STATUSES } from '@golden-abode/types';
import { memo, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { VENDOR_GROUP_STATUS_LABELS } from '../../constants';
import { Spacing } from '../../theme';
import type { StatusActionButtonProps, VendorStatusActionsProps } from '../../types';
import { Button } from '../ui';

function VendorStatusActionsComponent({
  group,
  isUpdating,
  onSelectStatus,
}: VendorStatusActionsProps) {
  const nextStatuses = ORDER_VENDOR_GROUP_NEXT_STATUSES[group.status];
  if (nextStatuses.length === 0) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      {nextStatuses.map((status) => (
        <StatusActionButton
          key={status}
          groupId={group.id}
          status={status}
          isUpdating={isUpdating}
          onSelectStatus={onSelectStatus}
        />
      ))}
    </View>
  );
}

function StatusActionButton({
  groupId,
  status,
  isUpdating,
  onSelectStatus,
}: StatusActionButtonProps) {
  const handlePress = useCallback(() => {
    onSelectStatus(groupId, status);
  }, [groupId, onSelectStatus, status]);

  return (
    <Button
      title={VENDOR_GROUP_STATUS_LABELS[status]}
      variant="secondary"
      disabled={isUpdating}
      onPress={handlePress}
    />
  );
}

export const VendorStatusActions = memo(VendorStatusActionsComponent);

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.sm,
  },
});
