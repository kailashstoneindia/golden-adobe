import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { ERROR_MESSAGES, TOAST_MESSAGES } from '../../constants';
import { useVendorHandoverMutation } from '../../hooks/delivery';
import { useToast } from '../../hooks/useToast';
import type { CapturedPhoto } from '../../services/delivery';
import { Colors, Spacing } from '../../theme';
import { formatDateTime, getApiErrorMessage } from '../../utils';
import { Button, Card, Text } from '../ui';
import { PhotoCaptureField } from './PhotoCaptureField';

const NO_DRIVER_MESSAGE = 'no driver assigned yet';

/**
 * A courtesy record that the goods left the shop (decision 0060). It never
 * blocks the driver and does not change the group status. The group DTO does
 * not carry the timestamp, so the confirmation lives in this card's state.
 */
export function VendorHandoverCard({ groupId }: Readonly<{ groupId: string }>) {
  const handover = useVendorHandoverMutation();
  const { showSuccess } = useToast();
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [handedOverAt, setHandedOverAt] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handlePress = (): void => {
    setErrorMessage(null);
    handover.mutate(
      { groupId, photo },
      {
        onSuccess: (result) => {
          setHandedOverAt(result.vendorHandedOverAt);
          showSuccess(TOAST_MESSAGES.vendorHandedOver);
        },
        onError: (error) => {
          const message = getApiErrorMessage(error, ERROR_MESSAGES.vendorHandoverFailed);
          setErrorMessage(
            message === NO_DRIVER_MESSAGE ? ERROR_MESSAGES.vendorHandoverNoDriver : message,
          );
        },
      },
    );
  };

  if (handedOverAt) {
    return (
      <Card style={styles.card}>
        <Text variant="bodyMedium">Handed to driver</Text>
        <Text variant="caption" color={Colors.inkSoft}>
          Recorded {formatDateTime(handedOverAt)}
        </Text>
      </Card>
    );
  }

  return (
    <Card style={styles.card}>
      <Text variant="bodyMedium">Handing over to the driver?</Text>
      <Text variant="caption" color={Colors.inkSoft}>
        Once ops assign a driver, record the handover when the goods leave your shop.
      </Text>
      <PhotoCaptureField
        label="Handover photo (optional)"
        photo={photo}
        onChange={setPhoto}
        disabled={handover.isPending}
      />
      {errorMessage ? (
        <Text variant="caption" color={Colors.brick}>
          {errorMessage}
        </Text>
      ) : null}
      <Button
        title={handover.isPending ? 'Saving…' : 'Handed to driver'}
        variant="secondary"
        disabled={handover.isPending}
        onPress={handlePress}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.sm },
});
