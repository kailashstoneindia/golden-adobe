import type { VendorListingStockDto } from '@golden-abode/types';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { Screen } from '../../src/components/layout/Screen';
import { VendorListingCard, type ListingStatusFilter } from '../../src/components/vendor';
import { Text } from '../../src/components/ui';
import { ERROR_MESSAGES, ROUTES } from '../../src/constants';
import { useVendorListingsQuery, usePendingConfirmationsQuery } from '../../src/hooks/vendor';
import { useSelectedVendorListingStore } from '../../src/stores/selected-vendor-listing.store';
import { Colors, Radius, Spacing } from '../../src/theme';

type ProductsFilterId = ListingStatusFilter | 'needs_stock';

const STATUS_FILTERS: Array<{ id: ProductsFilterId; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'needs_stock', label: 'Needs stock' },
  { id: 'out_of_stock', label: 'Out of stock' },
  { id: 'paused', label: 'Paused' },
];

export default function ProductsTabScreen() {
  const [statusFilter, setStatusFilter] = useState<ProductsFilterId>('all');
  const setSelectedListing = useSelectedVendorListingStore((store) => store.setSelectedListing);
  const pendingQuery = usePendingConfirmationsQuery();

  const apiStatus =
    statusFilter === 'all' || statusFilter === 'needs_stock' ? undefined : statusFilter;

  const listingsQuery = useVendorListingsQuery({
    status: apiStatus,
    limit: statusFilter === 'needs_stock' ? 100 : undefined,
  });

  const pendingCount = pendingQuery.data?.length ?? 0;
  const listings = useMemo(
    () => filterListingsForView(listingsQuery.data?.items ?? [], statusFilter),
    [listingsQuery.data?.items, statusFilter],
  );
  const needsStockCount = useMemo(
    () => countNeedsStock(listingsQuery.data?.items ?? []),
    [listingsQuery.data?.items],
  );

  const handleListingPress = useCallback(
    (listing: VendorListingStockDto) => {
      setSelectedListing(listing);
      router.push(ROUTES.screens.listingDetail);
    },
    [setSelectedListing],
  );

  const emptyMessage = useMemo(
    () => buildEmptyMessage(statusFilter, listingsQuery.isError),
    [listingsQuery.isError, statusFilter],
  );

  return (
    <Screen edges={['top']}>
      <View style={styles.root}>
        <View style={styles.headerRow}>
          <View>
            <Text variant="h1">Products</Text>
            <Text variant="caption" color={Colors.inkSoft}>
              Your listings, stock, and pricing
            </Text>
          </View>
          <Pressable onPress={() => router.push(ROUTES.screens.catalogSync)}>
            <Text variant="label" color={Colors.tangerine}>
              Sync catalog
            </Text>
          </Pressable>
        </View>

        {pendingCount > 0 ? (
          <Pressable
            style={styles.pendingBanner}
            onPress={() => router.push(ROUTES.screens.pendingConfirmations)}
          >
            <Text variant="bodyMedium" color={Colors.ember}>
              {pendingCount} pending match{pendingCount === 1 ? '' : 'es'}
            </Text>
            <Text variant="caption" color={Colors.ember}>
              Review
            </Text>
          </Pressable>
        ) : null}

        {needsStockCount > 0 && statusFilter !== 'needs_stock' ? (
          <Pressable
            style={styles.stockBanner}
            onPress={() => setStatusFilter('needs_stock')}
          >
            <Text variant="bodyMedium" color={Colors.navy}>
              {needsStockCount} listing{needsStockCount === 1 ? '' : 's'} need stock
            </Text>
            <Text variant="caption" color={Colors.navy}>
              Fix now
            </Text>
          </Pressable>
        ) : null}

        <View style={styles.filters}>
          {STATUS_FILTERS.map((filter) => {
            const isActive = statusFilter === filter.id;
            return (
              <Pressable
                key={filter.id}
                style={[styles.chip, isActive ? styles.chipActive : null]}
                onPress={() => setStatusFilter(filter.id)}
              >
                <Text
                  variant="caption"
                  color={isActive ? Colors.white : Colors.inkSoft}
                >
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <ProductsListBody
          isLoading={listingsQuery.isLoading}
          isError={listingsQuery.isError}
          listings={listings}
          emptyMessage={emptyMessage}
          onListingPress={handleListingPress}
          onSyncPress={() => router.push(ROUTES.screens.catalogSync)}
        />
      </View>
    </Screen>
  );
}

type ProductsListBodyProps = {
  isLoading: boolean;
  isError: boolean;
  listings: VendorListingStockDto[];
  emptyMessage: string;
  onListingPress: (listing: VendorListingStockDto) => void;
  onSyncPress: () => void;
};

function ProductsListBody({
  isLoading,
  isError,
  listings,
  emptyMessage,
  onListingPress,
  onSyncPress,
}: ProductsListBodyProps) {
  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Colors.tangerine} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centered}>
        <Text variant="body" color={Colors.brick}>
          {ERROR_MESSAGES.vendorListingsFailed}
        </Text>
      </View>
    );
  }

  if (listings.length === 0) {
    return (
      <View style={styles.centered}>
        <Text variant="body" color={Colors.inkSoft} style={styles.emptyText}>
          {emptyMessage}
        </Text>
        <Pressable onPress={onSyncPress}>
          <Text variant="label" color={Colors.tangerine}>
            Sync catalog
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FlatList
      data={listings}
      keyExtractor={(item) => item.vendorListingId}
      renderItem={({ item }) => (
        <VendorListingCard listing={item} onPress={onListingPress} />
      )}
      contentContainerStyle={styles.listContent}
      ItemSeparatorComponent={ListSeparator}
      showsVerticalScrollIndicator={false}
    />
  );
}

function ListSeparator() {
  return <View style={styles.separator} />;
}

function listingNeedsStock(listing: VendorListingStockDto): boolean {
  if (listing.isPaint) {
    return false;
  }
  return listing.quantityAvailable === null || listing.quantityAvailable === 0;
}

function filterListingsForView(
  listings: VendorListingStockDto[],
  statusFilter: ProductsFilterId,
): VendorListingStockDto[] {
  if (statusFilter !== 'needs_stock') {
    return listings;
  }
  return listings.filter(listingNeedsStock);
}

function countNeedsStock(listings: VendorListingStockDto[]): number {
  return listings.filter(listingNeedsStock).length;
}

function buildEmptyMessage(statusFilter: ProductsFilterId, isError: boolean): string {
  if (isError) {
    return ERROR_MESSAGES.vendorListingsFailed;
  }
  if (statusFilter === 'all') {
    return 'No listings yet — sync catalog from the master list.';
  }
  if (statusFilter === 'needs_stock') {
    return 'All countable listings have stock set.';
  }
  return 'No listings in this status.';
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: Spacing.lg + 2,
    paddingTop: Spacing.sm,
    gap: Spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  pendingBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.tangerineTint,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  stockBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.skyTint,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  chip: {
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
  },
  chipActive: {
    backgroundColor: Colors.navy,
    borderColor: Colors.navy,
  },
  listContent: {
    paddingBottom: Spacing.xxl,
  },
  separator: {
    height: Spacing.sm + 2,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  emptyText: {
    textAlign: 'center',
  },
});
