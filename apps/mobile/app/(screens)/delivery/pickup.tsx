import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { StopBanner } from '../../../src/components/delivery';
import { DemoScreen } from '../../../src/components/demo/DemoScreen';
import { Button, Card, EmptyStateCard, Text } from '../../../src/components/ui';
import { ERROR_MESSAGES, TOAST_MESSAGES } from '../../../src/constants';
import { useDeliveryJobQuery, usePickUpDeliveryMutation } from '../../../src/hooks/delivery';
import { useToast } from '../../../src/hooks/useToast';
import { Colors, Radius, Spacing } from '../../../src/theme';
import { getApiErrorMessage } from '../../../src/utils';

/** Every item must be ticked as loaded before "Picked up" unlocks (decision 0060). */
export default function DeliveryPickupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const jobQuery = useDeliveryJobQuery(id ?? null);
  const pickUp = usePickUpDeliveryMutation();
  const { showSuccess, showError } = useToast();
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const job = jobQuery.data;

  if (!job) {
    return (
      <DemoScreen title="Pickup" showBack>
        {jobQuery.isLoading ? null : (
          <EmptyStateCard title="Delivery not found" message={ERROR_MESSAGES.deliveryJobFailed} />
        )}
      </DemoScreen>
    );
  }

  const allLoaded = job.items.every((item) => loaded[item.orderItemId]);
  const canPickUp = job.status === 'assigned' && !job.blocked;

  const toggle = (orderItemId: string): void => {
    setLoaded((previous) => ({ ...previous, [orderItemId]: !previous[orderItemId] }));
  };

  const handlePickUp = (): void => {
    pickUp.mutate(job, {
      onSuccess: () => {
        showSuccess(TOAST_MESSAGES.deliveryPickedUp);
        router.back();
      },
      onError: (error) => {
        showError(getApiErrorMessage(error, ERROR_MESSAGES.deliveryActionFailed));
        void jobQuery.refetch();
      },
    });
  };

  return (
    <DemoScreen
      title="Pickup checklist"
      subtitle={`${job.orderNumber} · ${job.pickup.vendorName}`}
      showBack
    >
      {job.blocked ? <StopBanner reason={job.blockedReason} /> : null}
      <Text variant="body" color={Colors.inkSoft}>
        Tick each item once it is loaded on the vehicle.
      </Text>
      {job.items.map((item) => {
        const isLoaded = Boolean(loaded[item.orderItemId]);
        return (
          <Pressable
            key={item.orderItemId}
            onPress={() => toggle(item.orderItemId)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isLoaded }}
            disabled={!canPickUp}
          >
            <Card style={styles.itemRow}>
              <View style={[styles.box, isLoaded ? styles.boxChecked : null]}>
                {isLoaded ? (
                  <Text variant="caption" color={Colors.white}>
                    ✓
                  </Text>
                ) : null}
              </View>
              <View style={styles.itemText}>
                <Text variant="bodyMedium">{item.name}</Text>
                <Text variant="caption" color={Colors.inkSoft}>
                  {item.quantity}
                  {item.unit ? ` ${item.unit}` : ''}
                </Text>
              </View>
            </Card>
          </Pressable>
        );
      })}
      <Button
        title={pickUp.isPending ? 'Saving…' : 'Picked up'}
        fullWidth
        disabled={!canPickUp || !allLoaded || pickUp.isPending}
        onPress={handlePickUp}
      />
      {!allLoaded && canPickUp ? (
        <Text variant="caption" color={Colors.inkSoft} style={styles.hint}>
          Tick every item to continue.
        </Text>
      ) : null}
    </DemoScreen>
  );
}

const styles = StyleSheet.create({
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  itemText: { flex: 1, gap: Spacing.xs },
  box: {
    width: 26,
    height: 26,
    borderRadius: Radius.sm / 2,
    borderWidth: 1.5,
    borderColor: Colors.line,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxChecked: {
    borderColor: Colors.navy,
    backgroundColor: Colors.navy,
  },
  hint: { textAlign: 'center' },
});
