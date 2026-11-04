import { Role, type ArtisanAccountDetailsInputDto } from '@golden-abode/types';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { ArtisanBankFields } from '../../src/components/artisans';
import { DemoScreen } from '../../src/components/demo/DemoScreen';
import { Button, Text } from '../../src/components/ui';
import { ERROR_MESSAGES, TOAST_MESSAGES } from '../../src/constants';
import {
  useArtisanProfileQuery,
  useReplaceArtisanAccountDetailsMutation,
} from '../../src/hooks/artisans';
import { useAuth } from '../../src/hooks/auth';
import { useToast } from '../../src/hooks/useToast';
import { Colors, Spacing } from '../../src/theme';
import {
  getApiErrorMessage,
  toArtisanAccountDetailsFormValues,
  validateArtisanAccountDetails,
} from '../../src/utils';

export default function ArtisanBankScreen() {
  const { user } = useAuth();
  const profileQuery = useArtisanProfileQuery(user?.role === Role.ARTISAN);
  const replaceAccountDetails = useReplaceArtisanAccountDetailsMutation();
  const { showSuccess, showError } = useToast();
  const profile = profileQuery.data;
  const [values, setValues] = useState<ArtisanAccountDetailsInputDto>(
    toArtisanAccountDetailsFormValues(profile),
  );
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setValues(toArtisanAccountDetailsFormValues(profile));
  }, [profile?.accountDetails?.updatedAt]);

  const updateField = (field: keyof ArtisanAccountDetailsInputDto, value: string): void => {
    setValues((previous) => ({ ...previous, [field]: value }));
  };

  const handleSave = (): void => {
    const validationError = validateArtisanAccountDetails(values);
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setFormError(null);
    replaceAccountDetails.mutate(values, {
      onSuccess: () => showSuccess(TOAST_MESSAGES.artisanBankSaved),
      onError: (error) =>
        showError(getApiErrorMessage(error, ERROR_MESSAGES.artisanBankSaveFailed)),
    });
  };

  return (
    <DemoScreen
      title="Bank details"
      subtitle="Used for your payouts. Saving replaces the details on file."
      showBack
      footer={
        <Button
          title={replaceAccountDetails.isPending ? 'Saving…' : 'Save bank details'}
          fullWidth
          disabled={replaceAccountDetails.isPending || profileQuery.isLoading}
          onPress={handleSave}
        />
      }
    >
      <ArtisanBankFields values={values} onChange={updateField} />
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
