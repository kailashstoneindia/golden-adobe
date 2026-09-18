import type { SearchDocument } from '@golden-abode/types';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { SearchProductCard } from '../../src/components/catalog';
import { Screen } from '../../src/components/layout/Screen';
import { Text, TextInput } from '../../src/components/ui';
import { ERROR_MESSAGES, LAUNCH_CATEGORIES, ROUTES } from '../../src/constants';
import { useSearchProductsQuery } from '../../src/hooks/search';
import {
  selectHasSearchLocation,
  useLocationPreferenceStore,
} from '../../src/stores/location-preference.store';
import { useSelectedSearchProductStore } from '../../src/stores/selected-search-product.store';
import { Colors, Spacing } from '../../src/theme';
import { navigateToLocationGate } from '../../src/utils';

export default function SearchResultsScreen() {
  const routeParams = useLocalSearchParams<{ q?: string; category?: string }>();
  const hasSearchLocation = useLocationPreferenceStore(selectHasSearchLocation);
  const preference = useLocationPreferenceStore((store) => store.preference);
  const setSelectedProduct = useSelectedSearchProductStore((store) => store.setSelectedProduct);

  const [queryText, setQueryText] = useState(routeParams.q ?? '');
  const [submittedQuery, setSubmittedQuery] = useState(routeParams.q ?? '');

  const categoryPath = typeof routeParams.category === 'string' ? routeParams.category : undefined;
  const categoryLabel = useMemo(
    () => LAUNCH_CATEGORIES.find((category) => category.path === categoryPath)?.name,
    [categoryPath],
  );

  const locationLabel = preference.pincode ?? (preference.latitude ? 'Near you' : 'Set area');

  const searchQuery = useSearchProductsQuery({
    q: submittedQuery || undefined,
    category: categoryPath,
  });

  const handleSubmitSearch = useCallback(() => {
    setSubmittedQuery(queryText.trim());
  }, [queryText]);

  const handleProductPress = useCallback(
    (product: SearchDocument) => {
      setSelectedProduct(product);
      router.push(ROUTES.screens.productDetail);
    },
    [setSelectedProduct],
  );

  const handleChangeLocation = useCallback(() => {
    navigateToLocationGate({
      q: submittedQuery || undefined,
      category: categoryPath,
    });
  }, [categoryPath, submittedQuery]);

  if (!hasSearchLocation) {
    return (
      <Screen>
        <View style={styles.centered}>
          <Text variant="body">{ERROR_MESSAGES.searchLocationRequired}</Text>
          <Pressable onPress={handleChangeLocation} style={styles.linkButton}>
            <Text variant="label" color={Colors.tangerine}>
              Set your area
            </Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['top']}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Text variant="bodyMedium" color={Colors.sky}>
              ‹ Back
            </Text>
          </Pressable>
          <Pressable onPress={handleChangeLocation} style={styles.locationChip}>
            <Text variant="caption" color={Colors.navy}>
              {locationLabel}
            </Text>
          </Pressable>
        </View>

        <TextInput
          value={queryText}
          onChangeText={setQueryText}
          placeholder="Search MCB, pipes, paint…"
          returnKeyType="search"
          onSubmitEditing={handleSubmitSearch}
          containerStyle={styles.searchField}
        />

        {categoryLabel ? (
          <Text variant="caption" color={Colors.inkSoft}>
            Category: {categoryLabel}
          </Text>
        ) : null}

        <SearchResultsBody
          isLoading={searchQuery.isLoading}
          isError={searchQuery.isError}
          hits={searchQuery.data?.hits ?? []}
          total={searchQuery.data?.total ?? 0}
          onProductPress={handleProductPress}
        />
      </View>
    </Screen>
  );
}

type SearchResultsBodyProps = {
  isLoading: boolean;
  isError: boolean;
  hits: SearchDocument[];
  total: number;
  onProductPress: (product: SearchDocument) => void;
};

function SearchResultsBody({
  isLoading,
  isError,
  hits,
  total,
  onProductPress,
}: SearchResultsBodyProps) {
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
          {ERROR_MESSAGES.searchFailed}
        </Text>
      </View>
    );
  }

  if (hits.length === 0) {
    return (
      <View style={styles.centered}>
        <Text variant="body" color={Colors.inkSoft}>
          No products found in your city for this search.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={hits}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <SearchProductCard product={item} onPress={onProductPress} />
      )}
      contentContainerStyle={styles.listContent}
      ItemSeparatorComponent={ListSeparator}
      ListHeaderComponent={
        <Text variant="caption" color={Colors.inkSoft} style={styles.resultCount}>
          {total} result{total === 1 ? '' : 's'}
        </Text>
      }
      showsVerticalScrollIndicator={false}
    />
  );
}

function ListSeparator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: Spacing.lg + 2,
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  locationChip: {
    backgroundColor: Colors.skyTint,
    borderRadius: 999,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  searchField: {
    marginTop: Spacing.xs,
  },
  listContent: {
    paddingBottom: Spacing.xxl,
  },
  separator: {
    height: Spacing.sm + 2,
  },
  resultCount: {
    marginBottom: Spacing.sm,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  linkButton: {
    paddingVertical: Spacing.sm,
  },
});
