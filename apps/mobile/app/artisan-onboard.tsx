import { Role, type ArtisanAccountDetailsInputDto } from '@golden-abode/types';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import {
  ArtisanBankFields,
  ArtisanDocumentCard,
  ArtisanProfileFields,
} from '../src/components/artisans';
import { Screen } from '../src/components/layout/Screen';
import { Button, Text } from '../src/components/ui';
import { ERROR_MESSAGES, ROUTES } from '../src/constants';
import {
  useArtisanOnboardMutation,
  useArtisanProfileQuery,
  useReplaceArtisanAccountDetailsMutation,
  useUpdateArtisanProfileMutation,
} from '../src/hooks/artisans';
import { useAuth } from '../src/hooks/auth';
import { useLogout } from '../src/hooks/auth/useLogout';
import { Colors, Spacing } from '../src/theme';
import type { ArtisanProfileFormValues } from '../src/types';
import {
  EMPTY_ARTISAN_ACCOUNT_DETAILS,
  getApiErrorMessage,
  isArtisanOnboardingComplete,
  isNotFoundError,
  resolveAuthenticatedRoute,
  toArtisanProfileFormValues,
  toArtisanProfilePayload,
  validateArtisanAccountDetails,
  validateArtisanProfileForm,
} from '../src/utils';

const ARTISAN_ONBOARD_STEPS = ['Profile', 'Document', 'Bank details'] as const;
const PROFILE_STEP = 0;
const DOCUMENT_STEP = 1;
const BANK_STEP = 2;

export default function ArtisanOnboardScreen() {
  const { isAuthenticated, isHydrated, user } = useAuth();
  const isArtisan = user?.role === Role.ARTISAN;
  const profileQuery = useArtisanProfileQuery(isArtisan);
  const profile = profileQuery.data;
  const onboard = useArtisanOnboardMutation();
  const updateProfile = useUpdateArtisanProfileMutation();
  const replaceAccountDetails = useReplaceArtisanAccountDetailsMutation();
  const logout = useLogout();

  const [currentStepIndex, setCurrentStepIndex] = useState(PROFILE_STEP);
  const [profileValues, setProfileValues] = useState<ArtisanProfileFormValues>(
    toArtisanProfileFormValues(undefined),
  );
  const [bankValues, setBankValues] = useState<ArtisanAccountDetailsInputDto>(
    EMPTY_ARTISAN_ACCOUNT_DETAILS,
  );
  const [stepErrorMessage, setStepErrorMessage] = useState<string | null>(null);

  // Resume where the artisan left off, e.g. profile saved but app closed
  // before the document upload.
  useEffect(() => {
    if (!profile) {
      return;
    }
    setProfileValues(toArtisanProfileFormValues(profile));
    setCurrentStepIndex(isArtisanOnboardingComplete(profile) ? BANK_STEP : DOCUMENT_STEP);
  }, [profile?.id, profile?.documentUrl]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }
    if (!isAuthenticated || !user) {
      router.replace(ROUTES.auth.login);
      return;
    }
    if (user.role !== Role.ARTISAN) {
      router.replace(resolveAuthenticatedRoute(user));
    }
  }, [isAuthenticated, isHydrated, user]);

  const finishOnboarding = (): void => {
    router.replace(resolveAuthenticatedRoute(user));
  };

  const updateProfileField = <K extends keyof ArtisanProfileFormValues>(
    field: K,
    value: ArtisanProfileFormValues[K],
  ): void => {
    setProfileValues((previous) => ({ ...previous, [field]: value }));
  };

  const updateBankField = (field: keyof ArtisanAccountDetailsInputDto, value: string): void => {
    setBankValues((previous) => ({ ...previous, [field]: value }));
  };

  const handleSaveProfile = async (): Promise<void> => {
    const validationError = validateArtisanProfileForm(profileValues);
    if (validationError) {
      setStepErrorMessage(validationError);
      return;
    }
    setStepErrorMessage(null);
    const payload = toArtisanProfilePayload(profileValues);
    try {
      // Coming back to this step after the profile exists edits it instead —
      // POST is one-time and 409s on a second call.
      if (profile) {
        await updateProfile.mutateAsync(payload);
      } else {
        await onboard.mutateAsync(payload);
      }
      setCurrentStepIndex(DOCUMENT_STEP);
    } catch (error) {
      setStepErrorMessage(getApiErrorMessage(error, ERROR_MESSAGES.artisanProfileSaveFailed));
    }
  };

  const handleDocumentContinue = (): void => {
    if (!profile?.documentUrl) {
      setStepErrorMessage(ERROR_MESSAGES.artisanDocumentRequired);
      return;
    }
    setStepErrorMessage(null);
    setCurrentStepIndex(BANK_STEP);
  };

  const handleSaveBank = async (): Promise<void> => {
    const validationError = validateArtisanAccountDetails(bankValues);
    if (validationError) {
      setStepErrorMessage(validationError);
      return;
    }
    setStepErrorMessage(null);
    try {
      await replaceAccountDetails.mutateAsync(bankValues);
      finishOnboarding();
    } catch (error) {
      setStepErrorMessage(getApiErrorMessage(error, ERROR_MESSAGES.artisanBankSaveFailed));
    }
  };

  const handleBack = (): void => {
    setStepErrorMessage(null);
    setCurrentStepIndex((previous) => Math.max(PROFILE_STEP, previous - 1));
  };

  const handleLogout = async (): Promise<void> => {
    await logout.mutateAsync();
    router.replace(ROUTES.auth.login);
  };

  const isLoadingProfile = profileQuery.isLoading;
  const hasProfileLoadError = profileQuery.isError && !isNotFoundError(profileQuery.error);
  const isSavingProfile = onboard.isPending || updateProfile.isPending;

  if (!isHydrated || !user || !isArtisan) {
    return null;
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text variant="label">Ustaad setup</Text>
            <Text variant="h1" style={styles.title}>
              Complete your profile
            </Text>
            <Text variant="body" color={Colors.inkSoft}>
              Customers can hire you once an admin verifies your profile and document.
            </Text>
          </View>

          <View style={styles.stepsIndicatorWrap}>
            {ARTISAN_ONBOARD_STEPS.map((stepLabel, stepIndex) => {
              const isReached = stepIndex <= currentStepIndex;
              return (
                <View key={stepLabel} style={styles.stepItem}>
                  <View style={[styles.stepCircle, isReached ? styles.stepCircleActive : null]}>
                    <Text variant="caption" color={isReached ? Colors.white : Colors.inkSoft}>
                      {stepIndex + 1}
                    </Text>
                  </View>
                  <Text
                    variant="caption"
                    color={isReached ? Colors.navy : Colors.inkSoft}
                    style={styles.stepLabel}
                  >
                    {stepLabel}
                  </Text>
                </View>
              );
            })}
          </View>

          {isLoadingProfile ? (
            <Text variant="body" color={Colors.inkSoft}>
              Loading your profile…
            </Text>
          ) : hasProfileLoadError ? (
            <>
              <Text variant="body" color={Colors.brick}>
                {ERROR_MESSAGES.artisanProfileFailed}
              </Text>
              <Button
                title="Try again"
                variant="secondary"
                onPress={() => profileQuery.refetch()}
              />
            </>
          ) : (
            <>
              {currentStepIndex === PROFILE_STEP ? (
                <ArtisanProfileFields values={profileValues} onChange={updateProfileField} />
              ) : null}

              {currentStepIndex === DOCUMENT_STEP && profile ? (
                <ArtisanDocumentCard profile={profile} />
              ) : null}

              {currentStepIndex === BANK_STEP ? (
                <>
                  <Text variant="caption" color={Colors.inkSoft}>
                    Needed before payouts. You can skip this and add it later from your profile.
                  </Text>
                  <ArtisanBankFields values={bankValues} onChange={updateBankField} />
                </>
              ) : null}

              {stepErrorMessage ? (
                <Text variant="caption" color={Colors.brick} style={styles.formError}>
                  {stepErrorMessage}
                </Text>
              ) : null}

              <View style={styles.navigationButtonsWrap}>
                {currentStepIndex !== PROFILE_STEP ? (
                  <Button
                    title="Back"
                    variant="secondary"
                    onPress={handleBack}
                    style={styles.navigationButton}
                  />
                ) : null}
                {currentStepIndex === PROFILE_STEP ? (
                  <Button
                    title={isSavingProfile ? 'Saving…' : 'Continue'}
                    fullWidth
                    disabled={isSavingProfile}
                    onPress={handleSaveProfile}
                    style={styles.navigationButton}
                  />
                ) : null}
                {currentStepIndex === DOCUMENT_STEP ? (
                  <Button
                    title="Continue"
                    onPress={handleDocumentContinue}
                    style={styles.navigationButton}
                  />
                ) : null}
                {currentStepIndex === BANK_STEP ? (
                  <Button
                    title={replaceAccountDetails.isPending ? 'Saving…' : 'Finish'}
                    disabled={replaceAccountDetails.isPending}
                    onPress={handleSaveBank}
                    style={styles.navigationButton}
                  />
                ) : null}
              </View>

              {currentStepIndex === BANK_STEP ? (
                <Button title="Skip for now" variant="ghost" fullWidth onPress={finishOnboarding} />
              ) : null}
            </>
          )}

          <Button
            title="Log out"
            variant="ghost"
            fullWidth
            disabled={logout.isPending}
            onPress={handleLogout}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xxxl,
    paddingBottom: Spacing.xxl,
    gap: Spacing.md,
  },
  header: {
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  title: {
    marginTop: Spacing.xs,
  },
  stepsIndicatorWrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  stepItem: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  stepCircle: {
    width: 30,
    height: 30,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
  },
  stepCircleActive: {
    borderColor: Colors.navy,
    backgroundColor: Colors.navy,
  },
  stepLabel: {
    textAlign: 'center',
  },
  formError: {
    textAlign: 'center',
  },
  navigationButtonsWrap: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  navigationButton: {
    flex: 1,
  },
});
