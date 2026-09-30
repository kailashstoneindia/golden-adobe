import type { VendorListingStatus } from '@golden-abode/types';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Screen } from '../../src/components/layout/Screen';
import { Button, Card, Text, TextInput } from '../../src/components/ui';
import { ERROR_MESSAGES } from '../../src/constants';
import {
  useSetVendorListingStatusMutation,
  useSetVendorStockMutation,
} from '../../src/hooks/vendor';
import { useSelectedVendorListingStore } from '../../src/stores/selected-vendor-listing.store';
import { Colors, Radius, Spacing } from '../../src/theme';
import { formatInr } from '../../src/utils';

const STATUS_OPTIONS: VendorListingStatus[] = ['active', 'paused', 'out_of_stock'];

export default function ListingDetailScreen() {
  const selectedListing = useSelectedVendorListingStore((store) => store.selectedListing);
  const setSelectedListing = useSelectedVendorListingStore((store) => store.setSelectedListing);

  const stockMutation = useSetVendorStockMutation();
  const statusMutation = useSetVendorListingStatusMutation();

  const [quantityInput, setQuantityInput] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<VendorListingStatus>('active');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedListing) {
      return;
    }
    setQuantityInput(
      selectedListing.quantityAvailable === null ? '' : String(selectedListing.quantityAvailable),
    );
    setSelectedStatus(selectedListing.status);
  }, [selectedListing]);

  if (!selectedListing) {
    return (
      <Screen>
        <View style={styles.empty}>
          <Text variant="body">Listing details are unavailable.</Text>
          <Button title="Go back" variant="secondary" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  const isSubmitting = stockMutation.isPending || statusMutation.isPending;

  const handleSaveStock = async () => {
    if (selectedListing.isPaint) {
      setFormError('Paint listings have no countable stock.');
      return;
    }
    const quantityAvailable = Number(quantityInput);
    if (!Number.isFinite(quantityAvailable) || quantityAvailable < 0) {
      setFormError('Enter a valid stock quantity (0 or more).');
      return;
    }

    setFormError(null);
    try {
      const updated = await stockMutation.mutateAsync({
        vendorListingId: selectedListing.vendorListingId,
        body: { quantityAvailable },
      });
      setSelectedListing(updated);
    } catch {
      setFormError(ERROR_MESSAGES.vendorStockUpdateFailed);
    }
  };

  const handleSaveStatus = async () => {
    setFormError(null);
    try {
      const updated = await statusMutation.mutateAsync({
        vendorListingId: selectedListing.vendorListingId,
        body: { status: selectedStatus },
      });
      setSelectedListing(updated);
    } catch {
      setFormError(ERROR_MESSAGES.vendorStatusUpdateFailed);
    }
  };

  return (
    <Screen edges={['top']}>
      <View style={styles.root}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Text variant="bodyMedium" color={Colors.sky}>
            ‹ Back
          </Text>
        </Pressable>

        <Text variant="h2">{selectedListing.productName}</Text>
        <Text variant="caption" color={Colors.inkSoft}>
          {selectedListing.productCode}
        </Text>

        <Card>
          <Text variant="numeric">{formatInr(selectedListing.price)}</Text>
          <Text variant="caption" color={Colors.inkSoft} style={styles.meta}>
            Price is set by catalog import · edit stock and status here
          </Text>
        </Card>

        {!selectedListing.isPaint ? (
          <Card>
            <Text variant="bodyMedium">Stock</Text>
            <TextInput
              label="Quantity available"
              value={quantityInput}
              onChangeText={setQuantityInput}
              keyboardType="decimal-pad"
              placeholder="0"
              containerStyle={styles.field}
            />
            <Button
              title={stockMutation.isPending ? 'Saving…' : 'Save stock'}
              fullWidth
              disabled={isSubmitting}
              onPress={() => {
                void handleSaveStock();
              }}
            />
          </Card>
        ) : (
          <Card>
            <Text variant="bodyMedium">Stock</Text>
            <Text variant="caption" color={Colors.inkSoft} style={styles.meta}>
              Paint is tinted to order — availability is controlled by status only.
            </Text>
          </Card>
        )}

        <Card>
          <Text variant="bodyMedium">Status</Text>
          <View style={styles.statusRow}>
            {STATUS_OPTIONS.map((status) => {
              const isActive = selectedStatus === status;
              return (
                <Pressable
                  key={status}
                  style={[styles.statusChip, isActive ? styles.statusChipActive : null]}
                  onPress={() => setSelectedStatus(status)}
                >
                  <Text variant="caption" color={isActive ? Colors.white : Colors.inkSoft}>
                    {formatStatusOption(status)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Button
            title={statusMutation.isPending ? 'Saving…' : 'Save status'}
            fullWidth
            disabled={isSubmitting}
            onPress={() => {
              void handleSaveStatus();
            }}
          />
        </Card>

        {formError ? (
          <Text variant="caption" color={Colors.brick}>
            {formError}
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}

function formatStatusOption(status: VendorListingStatus): string {
  if (status === 'active') return 'Active';
  if (status === 'paused') return 'Paused';
  return 'Out of stock';
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: Spacing.lg + 2,
    gap: Spacing.md,
  },
  backBtn: {
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
    alignSelf: 'flex-start',
  },
  meta: {
    marginTop: Spacing.xs,
  },
  field: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginVertical: Spacing.md,
  },
  statusChip: {
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  statusChipActive: {
    backgroundColor: Colors.navy,
    borderColor: Colors.navy,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
});
