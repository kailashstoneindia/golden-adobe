import type { VendorListingStockDto } from '@golden-abode/types';
import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Colors, Radius, Spacing } from '../../theme';
import { formatInr } from '../../utils/currency';
import {
  formatListingQuantity,
  formatListingStatusLabel,
  listingStatusBadgeVariant,
} from '../../utils/vendor-listing';
import { Badge, Text } from '../ui';

type VendorListingCardProps = {
  listing: VendorListingStockDto;
  onPress: (listing: VendorListingStockDto) => void;
};

function VendorListingCardComponent({ listing, onPress }: VendorListingCardProps) {
  const handlePress = useCallback(() => {
    onPress(listing);
  }, [listing, onPress]);

  return (
    <Pressable style={styles.card} onPress={handlePress}>
      <View style={styles.info}>
        <Text variant="bodyMedium" numberOfLines={2}>
          {listing.productName}
        </Text>
        <Text variant="caption" color={Colors.inkSoft}>
          {listing.productCode}
          {listing.vendorSku ? ` · SKU ${listing.vendorSku}` : ''}
        </Text>
        <Text variant="numericSm" style={styles.price}>
          {formatInr(listing.price)}
        </Text>
        <Text variant="caption" color={Colors.inkSoft}>
          {formatListingQuantity(listing.quantityAvailable, listing.isPaint)}
        </Text>
      </View>
      <Badge
        label={formatListingStatusLabel(listing.status)}
        variant={listingStatusBadgeVariant(listing.status)}
      />
    </Pressable>
  );
}

export const VendorListingCard = memo(VendorListingCardComponent);

export type ListingStatusFilter = VendorListingStatus | 'all';

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.line,
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  price: {
    marginTop: Spacing.xs,
  },
});
