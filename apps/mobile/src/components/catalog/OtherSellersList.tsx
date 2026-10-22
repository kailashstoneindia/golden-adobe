import type { ProductListingRow } from '@golden-abode/types';
import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ERROR_MESSAGES } from '../../constants';
import { Colors, Spacing } from '../../theme';
import type {
  OtherSellersListProps,
  SelectableSellerRowProps,
  SellerRowProps,
  SellersMessageProps,
} from '../../types/catalog-search.types';
import { formatInr } from '../../utils';
import { Card, Text } from '../ui';

function OtherSellersListComponent({
  listings,
  isLoading,
  isError,
  hasSearchLocation,
  selectedVendorListingId,
  onSelectListing,
}: OtherSellersListProps) {
  if (!hasSearchLocation) {
    return <SellersMessage message={ERROR_MESSAGES.searchLocationRequired} />;
  }

  if (isLoading) {
    return <SellersMessage message="Loading sellers…" />;
  }

  if (isError) {
    return <SellersMessage message={ERROR_MESSAGES.productListingsFailed} />;
  }

  if (listings.length === 0) {
    return <SellersMessage message="No active sellers for this product in your city." />;
  }

  return (
    <Card>
      <Text variant="bodyMedium">Sellers near you</Text>
      <Text variant="caption" color={Colors.inkSoft} style={styles.meta}>
        Sorted by lowest price in your city. Select a seller to add to cart.
      </Text>
      {listings.map((listing) => (
        <SelectableSellerRow
          key={listing.vendorListingId}
          listing={listing}
          isSelected={listing.vendorListingId === selectedVendorListingId}
          onSelectListing={onSelectListing}
        />
      ))}
    </Card>
  );
}

function SelectableSellerRow({
  listing,
  isSelected,
  onSelectListing,
}: SelectableSellerRowProps) {
  const handlePress = useCallback(() => {
    if (!listing.isPaint) {
      onSelectListing(listing);
    }
  }, [listing, onSelectListing]);

  return (
    <SellerRow listing={listing} isSelected={isSelected} onPress={handlePress} />
  );
}

function SellerRow({ listing, isSelected, onPress }: SellerRowProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={listing.isPaint}
      style={[styles.row, isSelected ? styles.rowSelected : null]}
    >
      <View style={styles.rowMain}>
        <Text variant="bodyMedium" numberOfLines={1}>
          {listing.shopName}
        </Text>
        <Text variant="caption" color={Colors.inkSoft}>
          {formatListingMeta(listing)}
        </Text>
      </View>
      <Text variant="numericSm">{formatInr(listing.price)}</Text>
    </Pressable>
  );
}

function SellersMessage({ message }: SellersMessageProps) {
  return (
    <Card>
      <Text variant="bodyMedium">Sellers near you</Text>
      <Text variant="caption" color={Colors.inkSoft} style={styles.meta}>
        {message}
      </Text>
    </Card>
  );
}

function formatListingMeta(listing: ProductListingRow): string {
  if (listing.isPaint) {
    return 'Tinted to order — not available for cart';
  }
  const parts: string[] = [];
  if (listing.statedGrade) {
    parts.push(listing.statedGrade);
  }
  parts.push(listing.inStock ? 'In stock' : 'Out of stock');
  if (listing.quantityAvailable !== null) {
    parts.push(`${listing.quantityAvailable} available`);
  }
  return parts.join(' · ');
}

export const OtherSellersList = memo(OtherSellersListComponent);

const styles = StyleSheet.create({
  meta: {
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.line,
  },
  rowSelected: {
    backgroundColor: Colors.skyTint,
    marginHorizontal: -Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  rowMain: {
    flex: 1,
    gap: Spacing.xs,
  },
});
