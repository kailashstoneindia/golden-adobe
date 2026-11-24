import { DELIVERY_OTP_MAX_ATTEMPTS } from '@golden-abode/types';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PhotoCaptureField, StopBanner } from '../../../src/components/delivery';
import { DemoScreen } from '../../../src/components/demo/DemoScreen';
import { Button, Card, EmptyStateCard, Text, TextInput } from '../../../src/components/ui';
import { DELIVERY_CONSTANTS, ERROR_MESSAGES, TOAST_MESSAGES } from '../../../src/constants';
import { ApiError } from '../../../src/api';
import { useCompleteDeliveryMutation, useDeliveryJobQuery } from '../../../src/hooks/delivery';
import { useToast } from '../../../src/hooks/useToast';
import type { CapturedPhoto } from '../../../src/services/delivery';
import { Colors, Spacing } from '../../../src/theme';
import { getApiErrorMessage, isDeliveryOtp } from '../../../src/utils';

const WRONG_CODE_MESSAGE = 'That code is not correct';

/** Code from the customer plus a proof photo (decision 0060). */
export default function DeliveryCompleteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const jobQuery = useDeliveryJobQuery(id ?? null);
  const complete = useCompleteDeliveryMutation();
  const { showSuccess } = useToast();
  const [otp, setOtp] = useState('');
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  // The server does not return a counter, so tries are counted here.
  const [wrongTries, setWrongTries] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const job = jobQuery.data;

  if (!job) {
    return (
      <DemoScreen title="Deliver" showBack>
        {jobQuery.isLoading ? null : (
          <EmptyStateCard title="Delivery not found" message={ERROR_MESSAGES.deliveryJobFailed} />
        )}
      </DemoScreen>
    );
  }

  // After ops unlock, the customer has a new code; refreshing clears the lock.
  const handleRefreshAfterLock = async (): Promise<void> => {
    await jobQuery.refetch();
    setIsLocked(false);
    setWrongTries(0);
    setOtp('');
  };

  if (isLocked) {
    return (
      <DemoScreen title="Delivery locked" showBack>
        <Card style={styles.card}>
          <Text variant="bodyMedium">Locked, contact ops</Text>
          <Text variant="body" color={Colors.inkSoft}>
            {ERROR_MESSAGES.deliveryLocked} Once ops unlock it, the customer gets a new code. Then
            tap refresh and ask them for it.
          </Text>
        </Card>
        <Button title="Refresh" variant="secondary" fullWidth onPress={handleRefreshAfterLock} />
      </DemoScreen>
    );
  }

  const canDeliver = job.status === 'picked_up' && !job.blocked;
  const triesLeft = DELIVERY_OTP_MAX_ATTEMPTS - wrongTries;

  const handleDeliver = (): void => {
    if (!isDeliveryOtp(otp)) {
      setFieldError(ERROR_MESSAGES.deliveryOtpInvalid);
      return;
    }
    if (!photo) {
      setFieldError(ERROR_MESSAGES.deliveryPhotoRequired);
      return;
    }
    setFieldError(null);
    complete.mutate(
      { jobId: job.id, otp, photo },
      {
        onSuccess: () => {
          showSuccess(TOAST_MESSAGES.deliveryCompleted);
          router.back();
        },
        onError: (error) => {
          if (error instanceof ApiError && error.statusCode === 403) {
            setIsLocked(true);
            return;
          }
          if (error instanceof ApiError && error.message.startsWith(WRONG_CODE_MESSAGE)) {
            setWrongTries((previous) => previous + 1);
            setOtp('');
          }
          setFieldError(getApiErrorMessage(error, ERROR_MESSAGES.deliveryActionFailed));
        },
      },
    );
  };

  return (
    <DemoScreen
      title="Deliver"
      subtitle={`${job.orderNumber} · ${job.drop.recipientName}`}
      showBack
    >
      {job.blocked ? <StopBanner reason={job.blockedReason} /> : null}
      <TextInput
        label="Customer's delivery code"
        placeholder="6-digit code"
        value={otp}
        onChangeText={(value) => setOtp(value.replace(/\D/g, ''))}
        keyboardType="number-pad"
        maxLength={DELIVERY_CONSTANTS.otpLength}
        editable={canDeliver && !complete.isPending}
      />
      {wrongTries > 0 ? (
        <Text variant="caption" color={Colors.brick}>
          {triesLeft} {triesLeft === 1 ? 'try' : 'tries'} left before the delivery locks.
        </Text>
      ) : null}
      <PhotoCaptureField
        label="Photo of the delivered goods"
        photo={photo}
        onChange={setPhoto}
        disabled={!canDeliver || complete.isPending}
      />
      {fieldError ? (
        <Text variant="caption" color={Colors.brick}>
          {fieldError}
        </Text>
      ) : null}
      <View style={styles.footer}>
        <Button
          title={complete.isPending ? 'Saving…' : 'Delivered'}
          fullWidth
          disabled={!canDeliver || complete.isPending}
          onPress={handleDeliver}
        />
      </View>
    </DemoScreen>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.sm },
  footer: { marginTop: Spacing.sm },
});
