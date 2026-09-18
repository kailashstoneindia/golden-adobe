import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Screen } from '../../src/components/layout/Screen';
import { Button, Text, TextInput } from '../../src/components/ui';
import { ERROR_MESSAGES } from '../../src/constants';
import { useCustomerLocationPreference } from '../../src/hooks/location';
import { Colors, Spacing } from '../../src/theme';
import { navigateToSearchResultsAfterLocation } from '../../src/utils';

export default function LocationGateScreen() {
  const routeParams = useLocalSearchParams<{ q?: string; category?: string }>();
  const {
    errorMessage,
    isSavingPincode,
    isCapturingGps,
    handleSavePincode,
    handleCaptureGps,
  } = useCustomerLocationPreference();

  const [pincodeInput, setPincodeInput] = useState('');

  const handleContinueWithPincode = async () => {
    const didSave = await handleSavePincode(pincodeInput);
    if (!didSave) {
      return;
    }
    navigateToSearchResultsAfterLocation({
      q: routeParams.q,
      category: routeParams.category,
    });
  };

  const handleContinueWithGps = async () => {
    const didCapture = await handleCaptureGps();
    if (!didCapture) {
      return;
    }
    navigateToSearchResultsAfterLocation({
      q: routeParams.q,
      category: routeParams.category,
    });
  };

  return (
    <Screen>
      <View style={styles.root}>
        <Button title="‹ Back" variant="ghost" onPress={() => router.back()} />
        <Text variant="h1" style={styles.title}>
          Where should we search?
        </Text>
        <Text variant="body" color={Colors.inkSoft} style={styles.subtitle}>
          Prices and stock are local to your city. Enter a pincode or use your current location.
        </Text>

        <TextInput
          label="Pincode"
          value={pincodeInput}
          onChangeText={setPincodeInput}
          keyboardType="number-pad"
          maxLength={6}
          placeholder="e.g. 110001"
          error={errorMessage ?? undefined}
        />

        <Button
          title={isSavingPincode ? 'Saving…' : 'Use this pincode'}
          fullWidth
          disabled={isSavingPincode || isCapturingGps}
          onPress={() => {
            void handleContinueWithPincode();
          }}
        />

        <Button
          title={isCapturingGps ? 'Getting location…' : 'Use current location'}
          variant="secondary"
          fullWidth
          disabled={isSavingPincode || isCapturingGps}
          onPress={() => {
            void handleContinueWithGps();
          }}
        />

        <Text variant="caption" color={Colors.inkSoft} style={styles.hint}>
          {ERROR_MESSAGES.searchLocationRequired}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: Spacing.lg + 2,
    paddingTop: Spacing.sm,
    gap: Spacing.md,
  },
  title: {
    marginTop: Spacing.sm,
  },
  subtitle: {
    marginBottom: Spacing.sm,
  },
  hint: {
    marginTop: Spacing.sm,
  },
});
