import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { ERROR_MESSAGES } from '../../constants';
import { useToast } from '../../hooks/useToast';
import { captureDeliveryPhoto, type CapturedPhoto } from '../../services/delivery';
import { Colors, Radius, Spacing } from '../../theme';
import { getApiErrorMessage } from '../../utils';
import { Button, Text } from '../ui';

type PhotoCaptureFieldProps = {
  label: string;
  photo: CapturedPhoto | null;
  onChange: (photo: CapturedPhoto | null) => void;
  disabled?: boolean;
};

export function PhotoCaptureField({ label, photo, onChange, disabled }: PhotoCaptureFieldProps) {
  const { showError } = useToast();
  const [isCapturing, setIsCapturing] = useState(false);

  const capture = async (source: 'camera' | 'library'): Promise<void> => {
    setIsCapturing(true);
    try {
      const next = await captureDeliveryPhoto(source);
      if (next) {
        onChange(next);
      }
    } catch (error) {
      showError(getApiErrorMessage(error, ERROR_MESSAGES.deliveryPhotoUploadFailed));
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Text variant="caption" color={Colors.inkSoft}>
        {label}
      </Text>
      {photo ? (
        <Image source={{ uri: photo.uri }} style={styles.preview} resizeMode="cover" />
      ) : null}
      <View style={styles.actions}>
        <Button
          title={photo ? 'Retake photo' : 'Take photo'}
          variant="secondary"
          disabled={disabled || isCapturing}
          onPress={() => void capture('camera')}
        />
        {/* The simulator has no camera; development builds can pick a file instead. */}
        {__DEV__ ? (
          <Button
            title="From library"
            variant="ghost"
            disabled={disabled || isCapturing}
            onPress={() => void capture('library')}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.sm },
  preview: {
    width: '100%',
    height: 180,
    borderRadius: Radius.md,
    backgroundColor: Colors.background,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
});
