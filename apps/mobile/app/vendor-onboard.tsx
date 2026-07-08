import { useEffect } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Role } from '@golden-abode/types';

import { Screen } from '../src/components/layout/Screen';
import { Button, Card, Text, TextInput } from '../src/components/ui';
import { ROUTES } from '../src/constants';
import indianBanks from '../src/data/indian-banks.json';
import { useAuth } from '../src/hooks/auth';
import { useShopLocation, useVendorOnboardForm } from '../src/hooks/vendor';
import { Colors, Spacing } from '../src/theme';
import { needsVendorOnboarding, resolveAuthenticatedRoute } from '../src/utils/user';
import { parseManualCoordinates } from '../src/utils/coordinates';

export default function VendorOnboardScreen() {
  const { isAuthenticated, isHydrated, user } = useAuth();
  const shopLocation = useShopLocation();
  const vendorForm = useVendorOnboardForm();

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

  const handleSubmit = (): void => {
    const hasManualCoordinates = shopLocation.applyManualCoordinates();
    const resolvedCoordinates = hasManualCoordinates
      ? parseManualCoordinates(shopLocation.manualLatitude, shopLocation.manualLongitude)
      : shopLocation.coordinates;

    vendorForm.handleSubmit(resolvedCoordinates);
  };

  if (!isHydrated || !user || user.role !== Role.VENDOR || !needsVendorOnboarding(user)) {
    return null;
  }

  const locationLabel = shopLocation.coordinates
    ? `${shopLocation.coordinates.latitude.toFixed(5)}, ${shopLocation.coordinates.longitude.toFixed(5)}`
    : 'Not captured yet';

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

          <Text variant="h3">Shop details</Text>
          <TextInput
            label="Shop name"
            placeholder="Kailash Stones"
            value={vendorForm.formValues.shopName}
            onChangeText={(value) => vendorForm.updateField('shopName', value)}
            autoCapitalize="words"
          />
          <TextInput
            label="Shop address"
            placeholder="Plot 12, Vaishali Nagar, Jaipur"
            value={vendorForm.formValues.address}
            onChangeText={(value) => vendorForm.updateField('address', value)}
            multiline
          />

          <Text variant="h3" style={styles.sectionTitle}>
            Location
          </Text>
          <Card style={styles.locationCard}>
            <Text variant="caption" color={Colors.inkSoft}>
              Pin your shop on the map
            </Text>
            <Text variant="bodyMedium">{locationLabel}</Text>
            <Button
              title={shopLocation.isLoadingLocation ? 'Capturing…' : 'Use current location'}
              variant="ghost"
              disabled={shopLocation.isLoadingLocation}
              onPress={shopLocation.captureLocation}
            />
            {shopLocation.locationError ? (
              <Text variant="caption" color={Colors.brick}>
                {shopLocation.locationError}
              </Text>
            ) : null}
            <TextInput
              label="Latitude"
              placeholder="26.9124"
              value={shopLocation.manualLatitude}
              onChangeText={shopLocation.updateManualLatitude}
              keyboardType="decimal-pad"
            />
            <TextInput
              label="Longitude"
              placeholder="75.7873"
              value={shopLocation.manualLongitude}
              onChangeText={shopLocation.updateManualLongitude}
              keyboardType="decimal-pad"
            />
          </Card>

          <Text variant="h3" style={styles.sectionTitle}>
            Payout details
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
            onChangeText={(value) => vendorForm.updateAccountDetailsField('accountHolderName', value)}
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

          {vendorForm.errorMessage ? (
            <Text variant="caption" color={Colors.brick} style={styles.formError}>
              {vendorForm.errorMessage}
            </Text>
          ) : null}

          <Button
            title="Submit for approval"
            fullWidth
            disabled={vendorForm.isSubmitting}
            onPress={handleSubmit}
            style={styles.submitButton}
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
  sectionTitle: {
    marginTop: Spacing.sm,
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
  submitButton: {
    marginTop: Spacing.md,
  },
});
