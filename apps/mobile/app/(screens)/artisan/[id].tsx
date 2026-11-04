import { Role, type CustomerAddressDto } from '@golden-abode/types';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AddressCard } from '../../../src/components/addresses';
import { DemoScreen } from '../../../src/components/demo/DemoScreen';
import { Badge, Button, Card, EmptyStateCard, Text, TextInput } from '../../../src/components/ui';
import { ERROR_MESSAGES, TOAST_MESSAGES, TRADE_TYPE_LABELS } from '../../../src/constants';
import {
  useArtisanPublicProfileQuery,
  useCreateHireRequestMutation,
} from '../../../src/hooks/artisans';
import { useAuth } from '../../../src/hooks/auth';
import { useAddressesQuery } from '../../../src/hooks/customers';
import { useToast } from '../../../src/hooks/useToast';
import { Colors, Spacing } from '../../../src/theme';
import { getApiErrorMessage, replaceToHireRequestDetail } from '../../../src/utils';

function formatAddressText(address: CustomerAddressDto): string {
  return [address.addressLine1, address.addressLine2, `${address.city} ${address.pincode}`]
    .filter(Boolean)
    .join(', ');
}

export default function ArtisanPublicProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const isCustomer = user?.role === Role.CUSTOMER;
  const profileQuery = useArtisanPublicProfileQuery(id ?? null);
  const addressesQuery = useAddressesQuery(isCustomer);
  const createHireRequest = useCreateHireRequestMutation();
  const { showSuccess, showError } = useToast();
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [addressText, setAddressText] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const profile = profileQuery.data;
  const addresses = addressesQuery.data ?? [];

  const handleSelectAddress = (address: CustomerAddressDto): void => {
    setSelectedAddressId(address.id);
    setAddressText(formatAddressText(address));
  };

  const handleHire = (): void => {
    const trimmedAddress = addressText.trim();
    if (!trimmedAddress) {
      setFormError(ERROR_MESSAGES.hireAddressRequired);
      return;
    }
    if (!id) {
      return;
    }
    setFormError(null);
    const trimmedNotes = notes.trim();
    createHireRequest.mutate(
      {
        artisanId: id,
        addressText: trimmedAddress,
        ...(trimmedNotes ? { notes: trimmedNotes } : {}),
      },
      {
        onSuccess: (request) => {
          showSuccess(TOAST_MESSAGES.hireRequestSent);
          replaceToHireRequestDetail(request.id);
        },
        onError: (error) => showError(getApiErrorMessage(error, ERROR_MESSAGES.hireRequestFailed)),
      },
    );
  };

  if (profileQuery.isLoading) {
    return (
      <DemoScreen title="Ustaad" showBack>
        <Text variant="body" color={Colors.inkSoft}>
          Loading profile…
        </Text>
      </DemoScreen>
    );
  }

  if (!profile) {
    return (
      <DemoScreen title="Ustaad" showBack>
        <EmptyStateCard
          title="Ustaad unavailable"
          message={ERROR_MESSAGES.artisanPublicProfileFailed}
        />
      </DemoScreen>
    );
  }

  const canHire = isCustomer && profile.isAvailable;

  return (
    <DemoScreen
      title={TRADE_TYPE_LABELS[profile.tradeType]}
      showBack
      footer={
        isCustomer ? (
          <Button
            title={
              createHireRequest.isPending
                ? 'Sending…'
                : profile.isAvailable
                  ? 'Send hire request'
                  : 'Not taking new jobs'
            }
            fullWidth
            disabled={!canHire || createHireRequest.isPending}
            onPress={handleHire}
          />
        ) : undefined
      }
    >
      <View style={styles.badges}>
        {profile.isVerified ? <Badge label="Verified Ustaad" variant="success" /> : null}
        <Badge
          label={profile.isAvailable ? 'Available' : 'Fully booked'}
          variant={profile.isAvailable ? 'info' : 'pending'}
        />
      </View>
      <Card style={styles.card}>
        {profile.experienceYears != null ? (
          <Text variant="bodyMedium">
            {profile.experienceYears} year{profile.experienceYears === 1 ? '' : 's'} of experience
          </Text>
        ) : null}
        <Text variant="body" color={Colors.inkSoft}>
          {profile.bio ?? 'This Ustaad hasn’t added a bio yet.'}
        </Text>
      </Card>

      {canHire ? (
        <>
          <Text variant="h3">Hire for a job</Text>
          <Text variant="caption" color={Colors.inkSoft}>
            Our team reviews every request before the Ustaad is notified.
          </Text>
          {addresses.map((address) => (
            <AddressCard
              key={address.id}
              address={address}
              isSelected={address.id === selectedAddressId}
              onPress={() => handleSelectAddress(address)}
            />
          ))}
          <TextInput
            label="Site address"
            placeholder="House no., street, area, city"
            value={addressText}
            onChangeText={(value) => {
              setSelectedAddressId(null);
              setAddressText(value);
            }}
            multiline
          />
          <TextInput
            label="What do you need done? (optional)"
            placeholder="Leaking pipe under the kitchen sink"
            value={notes}
            onChangeText={setNotes}
            multiline
          />
          {formError ? (
            <Text variant="caption" color={Colors.brick}>
              {formError}
            </Text>
          ) : null}
        </>
      ) : null}
    </DemoScreen>
  );
}

const styles = StyleSheet.create({
  badges: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  card: {
    gap: Spacing.sm,
  },
});
