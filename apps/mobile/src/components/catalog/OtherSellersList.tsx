import type { ProductListingRow } from '@golden-abode/types';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { ERROR_MESSAGES } from '../../constants';
import { Colors, Spacing } from '../../theme';
import type { OtherSellersListProps, SellerRowProps } from '../../types/catalog-search.types';
import { formatInr } from '../../utils';
import { Card, Text } from '../ui';

function OtherSellersListComponent({
  listings,
  isLoading,
  isError,
  hasSearchLocation,
}: OtherSellersListProps) {
  if (!hasSearchLocation) {
    return (
      <Card>
        <Text variant="bodyMedium">Sellers near you</Text>
        <Text variant="caption" color={Colors.inkSoft} style={styles.meta}>
          {ERROR_MESSAGES.searchLocationRequired}
        </Text>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <Text variant="bodyMedium">Sellers near you</Text>
        <Text variant="caption" color={Colors.inkSoft} style={styles.meta}>
          Loading sellers…
        </Text>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <Text variant="bodyMedium">Sellers near you</Text>
        <Text variant="caption" color={Colors.inkSoft} style={styles.meta}>
          {ERROR_MESSAGES.productListingsFailed}
        </Text>
      </Card>
    );
  }

  if (listings.length === 0) {
    return (
      <Card>
        <Text variant="bodyMedium">Sellers near you</Text>
        <Text variant="caption" color={Colors.inkSoft} style={styles.meta}>
          No active sellers for this product in your city.
        </Text>
      </Card>
    );
  }

  return (
    <Card>
      <Text variant="bodyMedium">Sellers near you</Text>
      <Text variant="caption" color={Colors.inkSoft} style={styles.meta}>
        Sorted by lowest price in your city
      </Text>
      {listings.map((listing) => (
        <SellerRow key={listing.vendorListingId} listing={listing} />
      ))}
    </Card>
  );
}

function SellerRow({ listing }: SellerRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.rowMain}>
        <Text variant="bodyMedium" numberOfLines={1}>
          {listing.shopName}
        </Text>
        <Text variant="caption" color={Colors.inkSoft}>
          {formatListingMeta(listing)}
        </Text>
      </View>
      <Text variant="numericSm">{formatInr(listing.price)}</Text>
    </View>
  );
}

function formatListingMeta(listing: ProductListingRow): string {
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
  rowMain: {
    flex: 1,
    gap: Spacing.xs,
  },
});
