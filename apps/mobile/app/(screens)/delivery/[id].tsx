import type { DeliveryJobDto } from '@golden-abode/types';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ContactBlock, StopBanner } from '../../../src/components/delivery';
import { DemoScreen } from '../../../src/components/demo/DemoScreen';
import { Badge, Button, Card, EmptyStateCard, Text } from '../../../src/components/ui';
import {
  DELIVERY_FAILURE_REASON_LABELS,
  DELIVERY_JOB_STATUS_LABELS,
  ERROR_MESSAGES,
} from '../../../src/constants';
import { useDeliveryJobQuery } from '../../../src/hooks/delivery';
import { Colors, Spacing } from '../../../src/theme';
import {
  formatDateTime,
  formatDropAddress,
  isDeliveryJobActionable,
  navigateToDeliveryStep,
  toDeliveryJobBadgeVariant,
} from '../../../src/utils';

export default function DeliveryJobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const jobQuery = useDeliveryJobQuery(id ?? null);
  const job = jobQuery.data;
  const refresh = () => jobQuery.refetch();

  if (jobQuery.isLoading) {
    return (
      <DemoScreen title="Delivery" showBack>
        <Text variant="body" color={Colors.inkSoft}>
          Loading delivery…
        </Text>
      </DemoScreen>
    );
  }

  if (!job) {
    return (
      <DemoScreen title="Delivery" showBack onRefresh={refresh}>
        <EmptyStateCard title="Delivery not found" message={ERROR_MESSAGES.deliveryJobFailed} />
      </DemoScreen>
    );
  }

  return (
    <DemoScreen title={job.orderNumber} showBack onRefresh={refresh}>
      <View style={styles.badges}>
        <Badge
          label={DELIVERY_JOB_STATUS_LABELS[job.status]}
          variant={toDeliveryJobBadgeVariant(job.status)}
        />
        {job.attemptNo > 1 ? <Badge label={`Attempt ${job.attemptNo}`} variant="pending" /> : null}
      </View>

      {job.blocked ? <StopBanner reason={job.blockedReason} /> : null}

      <ContactBlock
        title="Pick up from"
        name={job.pickup.vendorName}
        address={job.pickup.address}
        phone={job.pickup.phone}
        lat={job.pickup.lat}
        lng={job.pickup.lng}
      />
      <ContactBlock
        title="Deliver to"
        name={job.drop.recipientName}
        address={formatDropAddress(job.drop)}
        phone={job.drop.phone}
        lat={job.drop.lat}
        lng={job.drop.lng}
      />

      <Card style={styles.card}>
        <Text variant="label" color={Colors.inkSoft}>
          Items
        </Text>
        {job.items.map((item) => (
          <Text key={item.orderItemId} variant="body">
            {item.quantity}
            {item.unit ? ` ${item.unit}` : ''} × {item.name}
          </Text>
        ))}
      </Card>

      <JobTimeline job={job} />

      <JobActions job={job} />
    </DemoScreen>
  );
}

function JobTimeline({ job }: Readonly<{ job: DeliveryJobDto }>) {
  const lines = [
    job.vendorHandedOverAt
      ? `Vendor handed over ${formatDateTime(job.vendorHandedOverAt)}`
      : 'Vendor has not marked the handover yet',
    job.pickedUpAt ? `Picked up ${formatDateTime(job.pickedUpAt)}` : null,
    job.deliveredAt ? `Delivered ${formatDateTime(job.deliveredAt)}` : null,
    job.failedAt
      ? `Not delivered ${formatDateTime(job.failedAt)}${
          job.failureReason ? ` · ${DELIVERY_FAILURE_REASON_LABELS[job.failureReason]}` : ''
        }`
      : null,
  ].filter((line): line is string => Boolean(line));

  return (
    <Card style={styles.card}>
      {lines.map((line) => (
        <Text key={line} variant="caption" color={Colors.inkSoft}>
          {line}
        </Text>
      ))}
    </Card>
  );
}

function JobActions({ job }: Readonly<{ job: DeliveryJobDto }>) {
  if (!isDeliveryJobActionable(job)) {
    return null;
  }
  if (job.status === 'assigned') {
    return (
      <Button
        title="Start pickup"
        fullWidth
        onPress={() => navigateToDeliveryStep('pickup', job.id)}
      />
    );
  }
  return (
    <View style={styles.actions}>
      <Button
        title="Deliver"
        fullWidth
        onPress={() => navigateToDeliveryStep('complete', job.id)}
      />
      <Button
        title="Could not deliver"
        variant="secondary"
        fullWidth
        onPress={() => navigateToDeliveryStep('fail', job.id)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  badges: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  card: { gap: Spacing.xs },
  actions: { gap: Spacing.sm },
});
