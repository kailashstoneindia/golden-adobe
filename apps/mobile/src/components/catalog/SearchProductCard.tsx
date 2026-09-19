import type { SearchDocument } from '@golden-abode/types';
import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Colors, Radius, Spacing } from '../../theme';
import { formatCategoryPath, formatInr } from '../../utils';
import { Text } from '../ui';

type SearchProductCardProps = {
  product: SearchDocument;
  onPress: (product: SearchDocument) => void;
};

function SearchProductCardComponent({ product, onPress }: SearchProductCardProps) {
  const handlePress = useCallback(() => {
    onPress(product);
  }, [onPress, product]);

  return (
    <Pressable style={styles.card} onPress={handlePress}>
      <View style={styles.imagePlaceholder}>
        <Text variant="caption" color={Colors.subtle}>
          No image
        </Text>
      </View>
      <View style={styles.content}>
        <Text variant="bodyMedium" numberOfLines={2}>
          {product.name}
        </Text>
        <Text variant="caption" color={Colors.inkSoft} numberOfLines={1}>
          {product.brand ?? 'Unbranded'} · {formatCategoryPath(product.categoryPath)}
        </Text>
        <Text variant="numericSm" style={styles.price}>
          {formatInr(product.price)}
        </Text>
        <Text variant="caption" color={Colors.inkSoft}>
          {formatVendorCount(product.vendorCount)}
        </Text>
      </View>
    </Pressable>
  );
}

function formatVendorCount(vendorCount: number): string {
  if (vendorCount === 1) {
    return '1 vendor nearby';
  }
  return `${vendorCount} vendors nearby`;
}

export const SearchProductCard = memo(SearchProductCardComponent);

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: Spacing.md,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.line,
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  imagePlaceholder: {
    width: 72,
    height: 72,
    borderRadius: Radius.sm,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    gap: Spacing.xs,
  },
  price: {
    marginTop: Spacing.xs,
  },
});
