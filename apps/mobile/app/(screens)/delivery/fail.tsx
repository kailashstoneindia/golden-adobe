import { DELIVERY_FAILURE_REASONS, type DeliveryFailureReason } from '@golden-abode/types';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PhotoCaptureField, StopBanner } from '../../../src/components/delivery';
import { DemoScreen } from '../../../src/components/demo/DemoScreen';
import { Button, Chip, EmptyStateCard, Text, TextInput } from '../../../src/components/ui';
import {
  DELIVERY_CONSTANTS,
  DELIVERY_FAILURE_REASON_LABELS,
  ERROR_MESSAGES,
  TOAST_MESSAGES,
} from '../../../src/constants';
import { useDeliveryJobQuery, useFailDeliveryMutation } from '../../../src/hooks/delivery';
import { useToast } from '../../../src/hooks/useToast';
import type { CapturedPhoto } from '../../../src/services/delivery';
import { Colors, Spacing } from '../../../src/theme';
import { getApiErrorMessage } from '../../../src/utils';

/** Reason, optional note and a required photo (decision 0060). */
export default function DeliveryFailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const jobQuery = useDeliveryJobQuery(id ?? null);
  const fail = useFailDeliveryMutation();
  const { showSuccess } = useToast();
  const [reason, setReason] = useState<DeliveryFailureReason | null>(null);
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const job = jobQuery.data;

  if (!job) {
    return (
      <DemoScreen title="Could not deliver" showBack>
        {jobQuery.isLoading ? null : (
          <EmptyStateCard title="Delivery not found" message={ERROR_MESSAGES.deliveryJobFailed} />
        )}
      </DemoScreen>
    );
  }

  const canReport = job.status === 'picked_up' && !job.blocked;

  const handleReport = (): void => {
    if (!reason) {
      setFieldError(ERROR_MESSAGES.deliveryReasonRequired);
      return;
    }
    if (!photo) {
      setFieldError(ERROR_MESSAGES.deliveryPhotoRequired);
      return;
    }
    setFieldError(null);
    fail.mutate(
      { jobId: job.id, reason, note, photo },
      {
        onSuccess: () => {
          showSuccess(TOAST_MESSAGES.deliveryFailedReported);
          router.back();
        },
        onError: (error) =>
          setFieldError(getApiErrorMessage(error, ERROR_MESSAGES.deliveryActionFailed)),
      },
    );
  };

  return (
    <DemoScreen
      title="Could not deliver"
      subtitle={`${job.orderNumber} · ${job.drop.recipientName}`}
      showBack
    >
      {job.blocked ? <StopBanner reason={job.blockedReason} /> : null}
      <Text variant="caption" color={Colors.inkSoft}>
        What happened?
      </Text>
      <View style={styles.reasons}>
        {DELIVERY_FAILURE_REASONS.map((value) => (
          <Chip
            key={value}
            label={DELIVERY_FAILURE_REASON_LABELS[value]}
            isSelected={reason === value}
            onPress={() => setReason(value)}
            disabled={!canReport || fail.isPending}
          />
        ))}
      </View>
      <TextInput
        label="Note (optional)"
        placeholder="Called twice, gate locked"
        value={note}
        onChangeText={setNote}
        maxLength={DELIVERY_CONSTANTS.failureNoteMaxLength}
        multiline
        editable={canReport && !fail.isPending}
      />
      <PhotoCaptureField
        label="Photo of the site or goods"
        photo={photo}
        onChange={setPhoto}
        disabled={!canReport || fail.isPending}
      />
      {fieldError ? (
        <Text variant="caption" color={Colors.brick}>
          {fieldError}
        </Text>
      ) : null}
      <Button
        title={fail.isPending ? 'Reporting…' : 'Report'}
        variant="secondary"
        fullWidth
        disabled={!canReport || fail.isPending}
        onPress={handleReport}
      />
    </DemoScreen>
  );
}

const styles = StyleSheet.create({
  reasons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
});
