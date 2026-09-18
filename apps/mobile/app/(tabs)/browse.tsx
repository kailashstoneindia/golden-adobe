import { Pressable, StyleSheet, View } from 'react-native';

import { CategoryGrid } from '../../src/components/customer/CategoryGrid';
import { SearchBar } from '../../src/components/customer/SearchBar';
import { Screen } from '../../src/components/layout/Screen';
import { Text } from '../../src/components/ui';
import type { LaunchCategory } from '../../src/constants';
import {
  selectHasSearchLocation,
  useLocationPreferenceStore,
} from '../../src/stores/location-preference.store';
import { Colors, Spacing } from '../../src/theme';
import { navigateToCatalogSearch, navigateToLocationGate } from '../../src/utils';

export default function BrowseTabScreen() {
  const preference = useLocationPreferenceStore((store) => store.preference);
  const hasSearchLocation = useLocationPreferenceStore(selectHasSearchLocation);
  const locationLabel = preference.pincode ?? (hasSearchLocation ? 'Near you' : 'Set your area');

  const handleSearchPress = () => navigateToCatalogSearch();
  const handleLocationPress = () => navigateToLocationGate();
  const handleCategoryPress = (category: LaunchCategory) =>
    navigateToCatalogSearch({ category: category.path });

  return (
    <Screen edges={['top']}>
      <View style={styles.root}>
        <Text variant="h1">Browse</Text>
        <Text variant="caption" color={Colors.inkSoft} style={styles.subtitle}>
          Search materials from local vendors
        </Text>

        <View style={styles.search}>
          <SearchBar placeholder="Search MCB, pipes, paint…" onPress={handleSearchPress} />
        </View>

        <Pressable onPress={handleLocationPress}>
          <Text variant="label" color={Colors.tangerine}>
            Area: {locationLabel}
          </Text>
        </Pressable>

        <Text variant="h3" style={styles.sectionTitle}>
          Shop by category
        </Text>
        <CategoryGrid onCategoryPress={handleCategoryPress} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: Spacing.lg + 2,
    paddingTop: Spacing.sm,
    gap: Spacing.md,
  },
  subtitle: {
    marginTop: -Spacing.sm,
  },
  search: {
    marginTop: Spacing.xs,
  },
  sectionTitle: {
    marginTop: Spacing.sm,
  },
});
