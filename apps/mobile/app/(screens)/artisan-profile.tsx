import { Role } from '@golden-abode/types';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { ArtisanDocumentCard, ArtisanProfileFields } from '../../src/components/artisans';
import { DemoScreen } from '../../src/components/demo/DemoScreen';
import { Badge, Button, EmptyStateCard, Text } from '../../src/components/ui';
import { ERROR_MESSAGES, TOAST_MESSAGES } from '../../src/constants';
import { useArtisanProfileQuery, useUpdateArtisanProfileMutation } from '../../src/hooks/artisans';
import { useAuth } from '../../src/hooks/auth';
import { useToast } from '../../src/hooks/useToast';
import { Colors, Spacing } from '../../src/theme';
import type { ArtisanProfileFormValues } from '../../src/types';
import {
  getApiErrorMessage,
  toArtisanProfileFormValues,
  toArtisanProfilePayload,
  validateArtisanProfileForm,
} from '../../src/utils';

export default function ArtisanProfileScreen() {
  const { user } = useAuth();
  const profileQuery = useArtisanProfileQuery(user?.role === Role.ARTISAN);
  const updateProfile = useUpdateArtisanProfileMutation();
  const { showSuccess, showError } = useToast();
  const profile = profileQuery.data;
  const [values, setValues] = useState<ArtisanProfileFormValues>(
    toArtisanProfileFormValues(profile),
  );
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setValues(toArtisanProfileFormValues(profile));
  }, [profile?.id, profile?.updatedAt]);

  const updateField = <K extends keyof ArtisanProfileFormValues>(
    field: K,
    value: ArtisanProfileFormValues[K],
  ): void => {
    setValues((previous) => ({ ...previous, [field]: value }));
  };

  const handleSave = (): void => {
    const validationError = validateArtisanProfileForm(values);
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setFormError(null);
    updateProfile.mutate(toArtisanProfilePayload(values), {
      onSuccess: () => showSuccess(TOAST_MESSAGES.artisanProfileSaved),
      onError: (error) =>
        showError(getApiErrorMessage(error, ERROR_MESSAGES.artisanProfileSaveFailed)),
    });
  };

  if (profileQuery.isLoading) {
    return (
      <DemoScreen title="Ustaad profile" showBack>
        <Text variant="body" color={Colors.inkSoft}>
          Loading profile…
        </Text>
      </DemoScreen>
    );
  }

  if (!profile) {
    return (
      <DemoScreen title="Ustaad profile" showBack>
        <EmptyStateCard title="Profile unavailable" message={ERROR_MESSAGES.artisanProfileFailed} />
      </DemoScreen>
    );
  }

  return (
    <DemoScreen
      title="Ustaad profile"
      subtitle="Customers see your trade, experience and bio"
      showBack
      footer={
        <Button
          title={updateProfile.isPending ? 'Saving…' : 'Save profile'}
          fullWidth
          disabled={updateProfile.isPending}
          onPress={handleSave}
        />
      }
    >
      <Badge
        label={profile.isVerified ? 'Verified Ustaad' : 'Not verified yet'}
        variant={profile.isVerified ? 'success' : 'pending'}
      />
      <ArtisanDocumentCard profile={profile} />
      <ArtisanProfileFields values={values} onChange={updateField} />
      {formError ? (
        <Text variant="caption" color={Colors.brick} style={styles.formError}>
          {formError}
        </Text>
      ) : null}
    </DemoScreen>
  );
}

const styles = StyleSheet.create({
  formError: {
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
});
