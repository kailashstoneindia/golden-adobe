import { StyleSheet } from 'react-native';

import { ERROR_MESSAGES, TOAST_MESSAGES } from '../../constants';
import { useUploadArtisanDocumentMutation } from '../../hooks/artisans';
import { useToast } from '../../hooks/useToast';
import { pickArtisanDocument } from '../../services';
import { Colors, Spacing } from '../../theme';
import type { ArtisanDocumentCardProps } from '../../types';
import { getApiErrorMessage } from '../../utils';
import { Badge, Button, Card, Text } from '../ui';

export function ArtisanDocumentCard({ profile }: ArtisanDocumentCardProps) {
  const uploadDocument = useUploadArtisanDocumentMutation();
  const { showSuccess, showError } = useToast();
  const hasDocument = Boolean(profile.documentUrl);

  const handleUpload = async (): Promise<void> => {
    try {
      const file = await pickArtisanDocument();
      if (!file) {
        return;
      }
      await uploadDocument.mutateAsync(file);
      showSuccess(TOAST_MESSAGES.artisanDocumentUploaded);
    } catch (error) {
      showError(getApiErrorMessage(error, ERROR_MESSAGES.artisanDocumentUploadFailed));
    }
  };

  return (
    <Card style={styles.card}>
      <Text variant="bodyMedium">Verification document</Text>
      <Text variant="caption" color={Colors.inkSoft}>
        Aadhaar card or trade licence. PDF, JPG or PNG up to 10 MB. Only admins can see it.
      </Text>
      {profile.isVerified ? (
        <Badge label="Verified" variant="success" />
      ) : (
        <Badge
          label={hasDocument ? 'Uploaded · awaiting review' : 'Not uploaded'}
          variant={hasDocument ? 'info' : 'pending'}
        />
      )}
      <Button
        title={
          uploadDocument.isPending
            ? 'Uploading…'
            : hasDocument
              ? 'Replace document'
              : 'Upload document'
        }
        variant={hasDocument ? 'secondary' : 'primary'}
        disabled={uploadDocument.isPending}
        onPress={handleUpload}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.sm,
  },
});
