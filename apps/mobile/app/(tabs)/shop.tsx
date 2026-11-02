import { Role } from '@golden-abode/types';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { DemoScreen } from '../../src/components/demo/DemoScreen';
import { Button, EmptyStateCard, Text, TextInput } from '../../src/components/ui';
import { EMPTY_STATE_MESSAGES, ERROR_MESSAGES, ROUTES, TOAST_MESSAGES } from '../../src/constants';
import { useAuth } from '../../src/hooks/auth';
import { useLogout } from '../../src/hooks/auth/useLogout';
import { useToast } from '../../src/hooks/useToast';
import { useUpdateVendorProfileMutation, useVendorProfileQuery } from '../../src/hooks/vendor';
import { Colors, Spacing } from '../../src/theme';
import { getApiErrorMessage } from '../../src/utils';

export default function ShopTabScreen() {
  const { user } = useAuth();
  const isVendor = user?.role === Role.VENDOR;
  const profileQuery = useVendorProfileQuery(isVendor);
  const updateProfile = useUpdateVendorProfileMutation();
  const { showSuccess, showError } = useToast();
  const logout = useLogout();
  const [minOrderValue, setMinOrderValue] = useState('');
  const [hasLoadingUnloadingTeam, setHasLoadingUnloadingTeam] = useState<boolean | null>(null);

  useEffect(() => {
    const profile = profileQuery.data;
    if (!profile) {
      return;
    }
    setMinOrderValue(profile.minOrderValue === null ? '' : String(profile.minOrderValue));
    setHasLoadingUnloadingTeam(profile.hasLoadingUnloadingTeam);
  }, [profileQuery.data]);

  const handleSave = (): void => {
    const trimmed = minOrderValue.trim();
    const parsed = trimmed.length === 0 ? undefined : Number(trimmed);
    if (parsed !== undefined && (!Number.isFinite(parsed) || parsed < 0)) {
      showError(ERROR_MESSAGES.invalidMinOrderValue);
      return;
    }
    updateProfile.mutate(
      {
        minOrderValue: parsed,
        hasLoadingUnloadingTeam: hasLoadingUnloadingTeam ?? undefined,
      },
      {
        onSuccess: () => showSuccess(TOAST_MESSAGES.shopProfileSaved),
        onError: (error) =>
          showError(getApiErrorMessage(error, ERROR_MESSAGES.vendorProfileSaveFailed)),
      },
    );
  };

  // Vendors have no You tab, so the shop profile is their only way out.
  const handleLogout = async (): Promise<void> => {
    try {
      await logout.mutateAsync();
      showSuccess(TOAST_MESSAGES.logoutSuccess);
      router.replace(ROUTES.auth.login);
    } catch {
      showError(ERROR_MESSAGES.generic);
    }
  };

  const logoutButton = (
    <Button
      title={logout.isPending ? 'Logging out…' : 'Log out'}
      variant="ghost"
      fullWidth
      disabled={logout.isPending}
      onPress={handleLogout}
      style={styles.logout}
    />
  );

  if (!isVendor) {
    return (
      <DemoScreen title="Shop profile">
        <EmptyStateCard
          title="Shop profile unavailable"
          message={EMPTY_STATE_MESSAGES.shopProfileEmpty}
        />
      </DemoScreen>
    );
  }

  if (profileQuery.isLoading) {
    return (
      <DemoScreen title="Shop profile">
        <Text variant="body" color={Colors.inkSoft}>
          Loading shop profile…
        </Text>
      </DemoScreen>
    );
  }

  if (profileQuery.isError || !profileQuery.data) {
    return (
      <DemoScreen title="Shop profile">
        <EmptyStateCard
          title="Shop profile unavailable"
          message={ERROR_MESSAGES.vendorProfileFailed}
        />
        {logoutButton}
      </DemoScreen>
    );
  }

  const profile = profileQuery.data;
  const isCityMissing = profile.cityId === null;

  return (
    <DemoScreen title="Shop profile" subtitle="How customers see your business on Kailash Stones">
      <Text variant="h3">{profile.shopName}</Text>
      <Text variant="caption" color={Colors.inkSoft}>
        {profile.address}
      </Text>
      {isCityMissing ? (
        <Text variant="caption" color={Colors.brick} style={styles.warning}>
          City not resolved — listings hidden from customer search until an admin sets your city.
        </Text>
      ) : (
        <Text variant="caption" color={Colors.inkSoft}>
          City: {profile.city?.name ?? 'Resolved'}
        </Text>
      )}
      <TextInput
        label="Minimum order value"
        placeholder="No minimum"
        value={minOrderValue}
        onChangeText={setMinOrderValue}
        keyboardType="numeric"
      />
      <Text variant="caption" color={Colors.inkSoft}>
        Loading / unloading team for tiles and stone?
      </Text>
      <View style={styles.choiceRow}>
        <Pressable
          onPress={() => setHasLoadingUnloadingTeam(true)}
          style={[styles.choice, hasLoadingUnloadingTeam === true ? styles.choiceSelected : null]}
        >
          <Text variant="caption">Yes</Text>
        </Pressable>
        <Pressable
          onPress={() => setHasLoadingUnloadingTeam(false)}
          style={[styles.choice, hasLoadingUnloadingTeam === false ? styles.choiceSelected : null]}
        >
          <Text variant="caption">No</Text>
        </Pressable>
      </View>
      <Button
        title={updateProfile.isPending ? 'Saving…' : 'Save'}
        disabled={updateProfile.isPending}
        onPress={handleSave}
      />
      {logoutButton}
    </DemoScreen>
  );
}

const styles = StyleSheet.create({
  logout: {
    marginTop: Spacing.lg,
  },
  warning: {
    marginTop: Spacing.sm,
  },
  choiceRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  choice: {
    borderWidth: 1,
    borderColor: Colors.line,
    borderRadius: 999,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  choiceSelected: {
    backgroundColor: Colors.skyTint,
    borderColor: Colors.navy,
  },
});
