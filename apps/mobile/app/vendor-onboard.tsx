import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Role, VENDOR_ONBOARDING_STAGES, type VendorOnboardingStage } from '@golden-abode/types';

import { Screen } from '../src/components/layout/Screen';
import { Button, Card, Text, TextInput } from '../src/components/ui';
import { ERROR_MESSAGES, ROUTES, VENDOR_CONSTANTS } from '../src/constants';
import indianBanks from '../src/data/indian-banks.json';
import { useAuth } from '../src/hooks/auth';
import {
  useShopLocation,
  useVendorOnboardForm,
  useVendorOnboardingProgress,
} from '../src/hooks/vendor';
import { Colors, Spacing } from '../src/theme';
import { needsVendorOnboarding, resolveAuthenticatedRoute } from '../src/utils/user';

const VENDOR_ONBOARD_STEPS = ['Shop details', 'Bank details'] as const;

export default function VendorOnboardScreen() {
  const { isAuthenticated, isHydrated, user } = useAuth();
  const shopLocation = useShopLocation();
  const vendorForm = useVendorOnboardForm();
  const vendorOnboardingProgress = useVendorOnboardingProgress();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [stepErrorMessage, setStepErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      return;
    }

    const resolvedStepIndex = resolveStepIndexFromStage(user.onboardingStage);
    setCurrentStepIndex(resolvedStepIndex);
  }, [user?.id, user?.onboardingStage]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    if (!isAuthenticated || !user) {
      router.replace(ROUTES.auth.login);
      return;
    }

    if (user.role !== Role.VENDOR) {
      router.replace(resolveAuthenticatedRoute(user));
      return;
    }

    if (!needsVendorOnboarding(user)) {
      router.replace(resolveAuthenticatedRoute(user));
    }
  }, [isAuthenticated, isHydrated, user]);

  const locationLabel = shopLocation.coordinates
    ? `${shopLocation.coordinates.latitude.toFixed(5)}, ${shopLocation.coordinates.longitude.toFixed(5)}`
    : 'Not captured yet';

  const isFinalStep = currentStepIndex === VENDOR_ONBOARD_STEPS.length - 1;
  const isFirstStep = currentStepIndex === 0;

  const handleSubmit = (): void => {
    vendorForm.handleSubmit(shopLocation.coordinates);
  };

  const handleContinue = (): void => {
    const validationErrorMessage = resolveStepErrorMessage({
      currentStepIndex,
      shopName: vendorForm.formValues.shopName,
      address: vendorForm.formValues.address,
      gstin: vendorForm.formValues.gstin,
      accountHolderName: vendorForm.formValues.accountDetails.accountHolderName,
      bankName: vendorForm.formValues.accountDetails.bankName,
      ifscCode: vendorForm.formValues.accountDetails.ifscCode,
      branchName: vendorForm.formValues.accountDetails.branchName,
      accountNumber: vendorForm.formValues.accountDetails.accountNumber,
      hasCoordinates: Boolean(shopLocation.coordinates),
    });

    if (validationErrorMessage) {
      setStepErrorMessage(validationErrorMessage);
      return;
    }

    setStepErrorMessage(null);
    setCurrentStepIndex((previousStepIndex) => previousStepIndex + 1);
    const nextStepIndex = currentStepIndex + 1;
    const nextOnboardingStage = resolveOnboardingStageFromStepIndex(nextStepIndex);
    if (nextOnboardingStage) {
      vendorOnboardingProgress.mutate(nextOnboardingStage);
    }
  };

  const handleBack = (): void => {
    if (isFirstStep) {
      return;
    }

    setStepErrorMessage(null);
    setCurrentStepIndex((previousStepIndex) => previousStepIndex - 1);
    const previousStepIndex = currentStepIndex - 1;
    const previousOnboardingStage = resolveOnboardingStageFromStepIndex(previousStepIndex);
    if (previousOnboardingStage) {
      vendorOnboardingProgress.mutate(previousOnboardingStage);
    }
  };

  const visibleStepErrorMessage = useMemo(
    () => stepErrorMessage ?? vendorForm.errorMessage,
    [stepErrorMessage, vendorForm.errorMessage],
  );

  if (!isHydrated || !user || user.role !== Role.VENDOR || !needsVendorOnboarding(user)) {
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
            <Text variant="label">Vendor setup</Text>
            <Text variant="h1" style={styles.title}>
              Tell us about your shop
            </Text>
            <Text variant="body" color={Colors.inkSoft}>
              We need your business details before an admin can review your account.
            </Text>
          </View>
          <View style={styles.stepsIndicatorWrap}>
            {VENDOR_ONBOARD_STEPS.map((stepLabel, stepIndex) => {
              const isActiveStep = stepIndex === currentStepIndex;
              const isCompletedStep = stepIndex < currentStepIndex;

              return (
                <View key={stepLabel} style={styles.stepItem}>
                  <View
                    style={[
                      styles.stepCircle,
                      isActiveStep || isCompletedStep ? styles.stepCircleActive : null,
                    ]}
                  >
                    <Text
                      variant="caption"
                      color={isActiveStep || isCompletedStep ? Colors.white : Colors.inkSoft}
                    >
                      {stepIndex + 1}
                    </Text>
                  </View>
                  <Text
                    variant="caption"
                    color={isActiveStep || isCompletedStep ? Colors.navy : Colors.inkSoft}
                    style={styles.stepLabel}
                  >
                    {stepLabel}
                  </Text>
                </View>
              );
            })}
          </View>

          {currentStepIndex === 0 ? (
            <>
              <Text variant="h3">Shop details</Text>
              <TextInput
                label="Shop name"
                placeholder="Kailash Stones"
                value={vendorForm.formValues.shopName}
                onChangeText={(value) => vendorForm.updateField('shopName', value)}
                autoCapitalize="words"
              />
              <Card style={styles.locationCard}>
                <Text variant="caption" color={Colors.inkSoft}>
                  Use GPS or search by area/address to set your shop location
                </Text>
                <Text variant="bodyMedium">{locationLabel}</Text>
                <TextInput
                  label="Search location"
                  placeholder="Vaishali Nagar, Jaipur"
                  value={shopLocation.searchAddress}
                  onChangeText={shopLocation.updateSearchAddress}
                />
                <Button
                  title={shopLocation.isLoadingLocation ? 'Capturing…' : 'Use current location'}
                  variant="ghost"
                  disabled={shopLocation.isLoadingLocation}
                  onPress={shopLocation.captureLocation}
                />
                <Button
                  title={shopLocation.isSearchingLocation ? 'Searching…' : 'Search location'}
                  variant="secondary"
                  disabled={shopLocation.isSearchingLocation}
                  onPress={shopLocation.searchLocation}
                />
                {shopLocation.locationError ? (
                  <Text variant="caption" color={Colors.brick}>
                    {shopLocation.locationError}
                  </Text>
                ) : null}
              </Card>
              <TextInput
                label="Shop address"
                placeholder="Plot 12, Vaishali Nagar, Jaipur"
                value={vendorForm.formValues.address}
                onChangeText={(value) => vendorForm.updateField('address', value)}
                multiline
              />
            </>
          ) : null}

          {currentStepIndex === 1 ? (
            <>
              <Text variant="h3" style={styles.sectionTitle}>
                Bank details
              </Text>
              <TextInput
                label="UPI ID"
                placeholder="yourname@okicici"
                value={vendorForm.formValues.upiId}
                onChangeText={(value) => vendorForm.updateField('upiId', value)}
                autoCapitalize="none"
              />
              <TextInput
                label="Account holder name"
                placeholder="Tarun Jawla"
                value={vendorForm.formValues.accountDetails.accountHolderName}
                onChangeText={(value) =>
                  vendorForm.updateAccountDetailsField('accountHolderName', value)
                }
                autoCapitalize="words"
              />
              <View style={styles.dropdownContainer}>
                <Text variant="caption" color={Colors.inkSoft}>
                  Bank name
                </Text>
                <View style={styles.bankOptionsWrap}>
                  {indianBanks.map((bankName) => {
                    const isSelectedBank = vendorForm.formValues.accountDetails.bankName === bankName;
                    return (
                      <Pressable
                        key={bankName}
                        onPress={() => vendorForm.updateAccountDetailsField('bankName', bankName)}
                        style={[styles.bankOption, isSelectedBank ? styles.bankOptionSelected : null]}
                      >
                        <Text
                          variant="caption"
                          color={isSelectedBank ? Colors.navy : Colors.inkSoft}
                          style={styles.bankOptionText}
                        >
                          {bankName}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              <TextInput
                label="Account number"
                placeholder="123456789012"
                value={vendorForm.formValues.accountDetails.accountNumber}
                onChangeText={(value) => vendorForm.updateAccountDetailsField('accountNumber', value)}
                keyboardType="number-pad"
              />
              <TextInput
                label="IFSC code"
                placeholder="HDFC0000123"
                value={vendorForm.formValues.accountDetails.ifscCode}
                onChangeText={(value) => vendorForm.updateAccountDetailsField('ifscCode', value.toUpperCase())}
                autoCapitalize="characters"
                maxLength={11}
              />
              <TextInput
                label="Branch name"
                placeholder="Vaishali Nagar"
                value={vendorForm.formValues.accountDetails.branchName}
                onChangeText={(value) => vendorForm.updateAccountDetailsField('branchName', value)}
                autoCapitalize="words"
              />
              <TextInput
                label="GSTIN"
                placeholder="22AAAAA0000A1Z5"
                value={vendorForm.formValues.gstin}
                onChangeText={(value) => vendorForm.updateField('gstin', value.toUpperCase())}
                autoCapitalize="characters"
                maxLength={15}
              />
            </>
          ) : null}

          {visibleStepErrorMessage ? (
            <Text variant="caption" color={Colors.brick} style={styles.formError}>
              {visibleStepErrorMessage}
            </Text>
          ) : null}

          <View style={styles.navigationButtonsWrap}>
            {!isFirstStep ? (
              <Button title="Back" variant="secondary" onPress={handleBack} style={styles.navigationButton} />
            ) : null}
            {isFinalStep ? (
              <Button
                title="Finish"
                fullWidth={isFirstStep}
                disabled={vendorForm.isSubmitting}
                onPress={handleSubmit}
                style={styles.navigationButton}
              />
            ) : (
              <Button
                title="Continue"
                fullWidth={isFirstStep}
                onPress={handleContinue}
                style={styles.navigationButton}
              />
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

type ResolveStepErrorMessageParams = {
  currentStepIndex: number;
  shopName: string;
  address: string;
  gstin: string;
  accountHolderName: string;
  bankName: string;
  ifscCode: string;
  branchName: string;
  accountNumber: string;
  hasCoordinates: boolean;
};

function resolveStepErrorMessage(params: ResolveStepErrorMessageParams): string | null {
  if (params.currentStepIndex === 0) {
    const basicStepErrorMessage = resolveBasicStepErrorMessage(params.shopName, params.address);
    if (basicStepErrorMessage) {
      return basicStepErrorMessage;
    }

    return resolveShopStepErrorMessage(params.hasCoordinates);
  }

  if (params.currentStepIndex === 1) {
    return resolveBankStepErrorMessage({
      gstin: params.gstin,
      accountHolderName: params.accountHolderName,
      bankName: params.bankName,
      ifscCode: params.ifscCode,
      branchName: params.branchName,
      accountNumber: params.accountNumber,
    });
  }

  return null;
}

function resolveBasicStepErrorMessage(shopName: string, address: string): string | null {
  if (shopName.trim().length < VENDOR_CONSTANTS.shopNameMinLength) {
    return ERROR_MESSAGES.shopNameRequired;
  }

  if (address.trim().length < VENDOR_CONSTANTS.addressMinLength) {
    return ERROR_MESSAGES.addressRequired;
  }

  return null;
}

function resolveShopStepErrorMessage(hasCoordinates: boolean): string | null {
  if (hasCoordinates) {
    return null;
  }
  return ERROR_MESSAGES.locationRequired;
}

type ResolveBankStepErrorMessageParams = {
  gstin: string;
  accountHolderName: string;
  bankName: string;
  ifscCode: string;
  branchName: string;
  accountNumber: string;
};

function resolveBankStepErrorMessage(params: ResolveBankStepErrorMessageParams): string | null {
  if (!params.accountHolderName.trim()) {
    return ERROR_MESSAGES.accountHolderNameRequired;
  }

  if (!params.bankName.trim()) {
    return ERROR_MESSAGES.bankNameRequired;
  }

  if (params.ifscCode.trim().length !== VENDOR_CONSTANTS.ifscCodeLength) {
    return ERROR_MESSAGES.ifscCodeInvalid;
  }

  if (!params.branchName.trim()) {
    return ERROR_MESSAGES.branchNameRequired;
  }

  const accountNumberLength = params.accountNumber.trim().length;
  if (accountNumberLength < VENDOR_CONSTANTS.minAccountNumberLength) {
    return ERROR_MESSAGES.accountNumberInvalid;
  }

  if (accountNumberLength > VENDOR_CONSTANTS.maxAccountNumberLength) {
    return ERROR_MESSAGES.accountNumberInvalid;
  }

  const gstin = params.gstin.trim();
  if (gstin && gstin.length !== VENDOR_CONSTANTS.gstinLength) {
    return ERROR_MESSAGES.gstinLength;
  }

  return null;
}

function resolveStepIndexFromStage(onboardingStage: VendorOnboardingStage | null): number {
  if (
    !onboardingStage
    || onboardingStage === VENDOR_ONBOARDING_STAGES.basicDetails
    || onboardingStage === VENDOR_ONBOARDING_STAGES.shopDetails
  ) {
    return 0;
  }

  if (onboardingStage === VENDOR_ONBOARDING_STAGES.bankDetails) {
    return 1;
  }

  return 0;
}

function resolveOnboardingStageFromStepIndex(stepIndex: number): VendorOnboardingStage | null {
  if (stepIndex <= 0) {
    return VENDOR_ONBOARDING_STAGES.shopDetails;
  }

  if (stepIndex >= 1) {
    return VENDOR_ONBOARDING_STAGES.bankDetails;
  }

  return null;
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
  sectionTitle: {
    marginTop: Spacing.sm,
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
  locationCard: {
    gap: Spacing.sm,
  },
  dropdownContainer: {
    gap: Spacing.xs,
  },
  bankOptionsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  bankOption: {
    borderWidth: 1,
    borderColor: Colors.line,
    borderRadius: 999,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    backgroundColor: Colors.white,
  },
  bankOptionSelected: {
    borderColor: Colors.navy,
    backgroundColor: Colors.skyTint,
  },
  bankOptionText: {
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
