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
import { Button, Text, TextInput } from '../../src/components/ui';
import {
  ERROR_MESSAGES,
  LAUNCH_CATEGORIES,
  ROUTES,
  SEARCH_PRICE_FILTERS,
  type SearchPriceFilterId,
} from '../../src/constants';
import { useSearchProductsInfiniteQuery } from '../../src/hooks/search';
import {
  selectHasSearchLocation,
  useLocationPreferenceStore,
} from '../../src/stores/location-preference.store';
import { useSelectedSearchProductStore } from '../../src/stores/selected-search-product.store';
import { Colors, Radius, Spacing } from '../../src/theme';
import { navigateToLocationGate } from '../../src/utils';

export default function SearchResultsScreen() {
  const routeParams = useLocalSearchParams<{ q?: string; category?: string }>();
  const hasSearchLocation = useLocationPreferenceStore(selectHasSearchLocation);
  const preference = useLocationPreferenceStore((store) => store.preference);
  const setSelectedProduct = useSelectedSearchProductStore((store) => store.setSelectedProduct);

  const [queryText, setQueryText] = useState(routeParams.q ?? '');
  const [submittedQuery, setSubmittedQuery] = useState(routeParams.q ?? '');
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [priceFilterId, setPriceFilterId] = useState<SearchPriceFilterId>('all');

  const categoryPath = typeof routeParams.category === 'string' ? routeParams.category : undefined;
  const categoryLabel = useMemo(
    () => LAUNCH_CATEGORIES.find((category) => category.path === categoryPath)?.name,
    [categoryPath],
  );
  const priceFilter = SEARCH_PRICE_FILTERS.find((filter) => filter.id === priceFilterId);
  const locationLabel = preference.pincode ?? (preference.latitude ? 'Near you' : 'Set area');

  const searchQuery = useSearchProductsInfiniteQuery({
    q: submittedQuery || undefined,
    category: categoryPath,
    brand: selectedBrand ?? undefined,
    minPrice: priceFilter?.minPrice,
    maxPrice: priceFilter?.maxPrice,
  });

  const hits = useMemo(
    () => searchQuery.data?.pages.flatMap((page) => page.hits) ?? [],
    [searchQuery.data?.pages],
  );
  const total = searchQuery.data?.pages[0]?.total ?? 0;
  const brandFacets = useMemo(
    () => buildBrandOptions(searchQuery.data?.pages[0]?.facets?.brand),
    [searchQuery.data?.pages],
  );

  const handleSubmitSearch = useCallback(() => {
    setSubmittedQuery(queryText.trim());
    setSelectedBrand(null);
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

        <FilterChipRow
          label="Price"
          options={SEARCH_PRICE_FILTERS.map((filter) => ({
            id: filter.id,
            label: filter.label,
          }))}
          selectedId={priceFilterId}
          onSelect={(id) => setPriceFilterId(id as SearchPriceFilterId)}
        />

        {brandFacets.length > 0 ? (
          <FilterChipRow
            label="Brand"
            options={[{ id: 'all', label: 'All brands' }, ...brandFacets]}
            selectedId={selectedBrand ?? 'all'}
            onSelect={(id) => setSelectedBrand(id === 'all' ? null : id)}
          />
        ) : null}

        <SearchResultsBody
          isLoading={searchQuery.isLoading}
          isFetchingNextPage={searchQuery.isFetchingNextPage}
          isError={searchQuery.isError}
          hits={hits}
          total={total}
          hasNextPage={Boolean(searchQuery.hasNextPage)}
          onProductPress={handleProductPress}
          onLoadMore={() => {
            void searchQuery.fetchNextPage();
          }}
        />
      </View>
    </Screen>
  );
}

type FilterOption = { id: string; label: string };

type FilterChipRowProps = {
  label: string;
  options: FilterOption[];
  selectedId: string;
  onSelect: (id: string) => void;
};

function FilterChipRow({ label, options, selectedId, onSelect }: FilterChipRowProps) {
  return (
    <View style={styles.filterBlock}>
      <Text variant="caption" color={Colors.inkSoft}>
        {label}
      </Text>
      <View style={styles.chipRow}>
        {options.map((option) => {
          const isActive = selectedId === option.id;
          return (
            <Pressable
              key={option.id}
              style={[styles.chip, isActive ? styles.chipActive : null]}
              onPress={() => onSelect(option.id)}
            >
              <Text variant="caption" color={isActive ? Colors.white : Colors.inkSoft}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

type SearchResultsBodyProps = {
  isLoading: boolean;
  isFetchingNextPage: boolean;
  isError: boolean;
  hits: SearchDocument[];
  total: number;
  hasNextPage: boolean;
  onProductPress: (product: SearchDocument) => void;
  onLoadMore: () => void;
};

function SearchResultsBody({
  isLoading,
  isFetchingNextPage,
  isError,
  hits,
  total,
  hasNextPage,
  onProductPress,
  onLoadMore,
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
          Showing {hits.length} of {total}
        </Text>
      }
      ListFooterComponent={
        hasNextPage ? (
          <Button
            title={isFetchingNextPage ? 'Loading…' : 'Load more'}
            variant="secondary"
            fullWidth
            disabled={isFetchingNextPage}
            onPress={onLoadMore}
            style={styles.loadMore}
          />
        ) : null
      }
      showsVerticalScrollIndicator={false}
    />
  );
}

function ListSeparator() {
  return <View style={styles.separator} />;
}

function buildBrandOptions(
  brandFacet: Record<string, number> | undefined,
): FilterOption[] {
  if (!brandFacet) {
    return [];
  }
  return Object.keys(brandFacet)
    .sort((left, right) => left.localeCompare(right))
    .slice(0, 8)
    .map((brandName) => ({ id: brandName, label: brandName }));
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
  filterBlock: {
    gap: Spacing.xs,
  },
  chipRow: {
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
  resultCount: {
    marginBottom: Spacing.sm,
  },
  loadMore: {
    marginTop: Spacing.md,
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
