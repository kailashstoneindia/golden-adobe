import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Screen } from '../../src/components/layout/Screen';
import { Button, Card, Text } from '../../src/components/ui';
import { useSelectedSearchProductStore } from '../../src/stores/selected-search-product.store';
import { Colors, Radius, Spacing } from '../../src/theme';
import { formatCategoryPath, formatInr } from '../../src/utils';

export default function ProductDetailScreen() {
  const selectedProduct = useSelectedSearchProductStore((store) => store.selectedProduct);
  const attributeRows = useMemo(
    () => buildAttributeRows(selectedProduct?.attributes ?? {}),
    [selectedProduct?.attributes],
  );

  if (!selectedProduct) {
    return (
      <Screen>
        <View style={styles.empty}>
          <Text variant="body">Product details are unavailable.</Text>
          <Button title="Go back" variant="secondary" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['top']}>
      <View style={styles.root}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Text variant="bodyMedium" color={Colors.sky}>
            ‹ Back
          </Text>
        </Pressable>

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
          </Card>

          {attributeRows.length > 0 ? (
            <Card>
              <Text variant="bodyMedium">Specifications</Text>
              {attributeRows.map((row) => (
                <View key={row.key} style={styles.specRow}>
                  <Text variant="caption" color={Colors.inkSoft}>
                    {row.label}
                  </Text>
                  <Text variant="caption">{row.value}</Text>
                </View>
              ))}
            </Card>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
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
  return Object.entries(attributes).map(([key, value]) => ({
    key,
    label: formatAttributeLabel(key),
    value: String(value),
  }));
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
  backBtn: {
    paddingHorizontal: Spacing.lg + 2,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
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
  },
  footer: {
    paddingHorizontal: Spacing.lg + 2,
    paddingVertical: Spacing.lg,
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
});
