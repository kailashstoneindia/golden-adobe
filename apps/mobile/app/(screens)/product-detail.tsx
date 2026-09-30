import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen } from '../../src/components/layout/Screen';
import { Button, Card, Text } from '../../src/components/ui';
import {
  selectHasSearchLocation,
  useLocationPreferenceStore,
} from '../../src/stores/location-preference.store';
import { useSelectedSearchProductStore } from '../../src/stores/selected-search-product.store';
import { Colors, Radius, Spacing } from '../../src/theme';
import { formatCategoryPath, formatInr, navigateToLocationGate } from '../../src/utils';

export default function ProductDetailScreen() {
  const insets = useSafeAreaInsets();
  const selectedProduct = useSelectedSearchProductStore((store) => store.selectedProduct);
  const preference = useLocationPreferenceStore((store) => store.preference);
  const hasSearchLocation = useLocationPreferenceStore(selectHasSearchLocation);
  const footerPaddingBottom = Math.max(insets.bottom, Spacing.md);
  const attributeRows = useMemo(
    () => buildAttributeRows(selectedProduct?.attributes ?? {}),
    [selectedProduct?.attributes],
  );
  const locationLabel = preference.pincode ?? (preference.latitude ? 'Near you' : 'Set area');

  if (!selectedProduct) {
    return (
      <Screen>
        <View style={styles.empty}>
          <Text variant="h3">Product unavailable</Text>
          <Text variant="body" color={Colors.inkSoft} style={styles.emptyCopy}>
            Open a product from search results to review local price and specs.
          </Text>
          <Button title="Back to search" variant="secondary" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['top']}>
      <View style={styles.root}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Text variant="bodyMedium" color={Colors.sky}>
              ‹ Back
            </Text>
          </Pressable>
          <Pressable
            onPress={() => navigateToLocationGate()}
            style={styles.locationChip}
          >
            <Text variant="caption" color={Colors.navy}>
              {hasSearchLocation ? locationLabel : 'Set area'}
            </Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <Text variant="caption" color={Colors.subtle}>
              No image yet
            </Text>
          </View>

          <Text variant="h2">{selectedProduct.name}</Text>
          <Text variant="caption" color={Colors.inkSoft}>
            {selectedProduct.brand ?? 'Unbranded'} ·{' '}
            {formatCategoryPath(selectedProduct.categoryPath)}
          </Text>

          <Card>
            <Text variant="numeric">{formatInr(selectedProduct.price)}</Text>
            <Text variant="caption" color={Colors.inkSoft} style={styles.priceMeta}>
              Best local price · {formatVendorCount(selectedProduct.vendorCount)}
            </Text>
            <Text variant="caption" color={Colors.inkSoft} style={styles.priceMeta}>
              Listed in your city
              {selectedProduct.inStock ? '' : ' · stock accuracy coming soon'}
            </Text>
          </Card>

          {attributeRows.length > 0 ? (
            <Card>
              <Text variant="bodyMedium">Specifications</Text>
              {attributeRows.map((row) => (
                <View key={row.key} style={styles.specRow}>
                  <Text variant="caption" color={Colors.inkSoft} style={styles.specLabel}>
                    {row.label}
                  </Text>
                  <Text variant="caption" style={styles.specValue}>
                    {row.value}
                  </Text>
                </View>
              ))}
            </Card>
          ) : (
            <Card>
              <Text variant="bodyMedium">Specifications</Text>
              <Text variant="caption" color={Colors.inkSoft} style={styles.priceMeta}>
                No extra attributes on this product yet.
              </Text>
            </Card>
          )}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: footerPaddingBottom }]}>
          <Button title="Add to cart — coming soon" fullWidth disabled onPress={() => undefined} />
          <Button
            title="Back to results"
            variant="secondary"
            fullWidth
            onPress={() => router.back()}
          />
        </View>
      </View>
    </Screen>
  );
}

type AttributeRow = {
  key: string;
  label: string;
  value: string;
};

function buildAttributeRows(attributes: Record<string, string | number | boolean>): AttributeRow[] {
  return Object.entries(attributes)
    .map(([key, value]) => ({
      key,
      label: formatAttributeLabel(key),
      value: String(value),
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function formatAttributeLabel(key: string): string {
  return key
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatVendorCount(vendorCount: number): string {
  if (vendorCount === 1) {
    return 'available from 1 vendor';
  }
  return `available from ${vendorCount} vendors`;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg + 2,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  locationChip: {
    backgroundColor: Colors.skyTint,
    borderRadius: 999,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.lg + 2,
    paddingBottom: Spacing.xxl,
    gap: Spacing.md,
  },
  hero: {
    height: 180,
    borderRadius: Radius.md,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priceMeta: {
    marginTop: Spacing.xs,
  },
  specRow: {
    marginTop: Spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
    paddingBottom: Spacing.sm,
  },
  specLabel: {
    flex: 1,
  },
  specValue: {
    flex: 1,
    textAlign: 'right',
  },
  footer: {
    paddingHorizontal: Spacing.lg + 2,
    paddingTop: Spacing.md,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.line,
    gap: Spacing.sm,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  emptyCopy: {
    textAlign: 'center',
  },
});
