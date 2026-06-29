import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { DemoScreen } from '../../src/components/demo/DemoScreen';
import { DemoVendorCard } from '../../src/components/demo/DemoCards';
import { SearchBar } from '../../src/components/customer/SearchBar';
import { Text } from '../../src/components/ui';
import { ROUTES } from '../../src/constants';
import { DEMO_VENDORS } from '../../src/data/demo-content';
import { Colors, Spacing } from '../../src/theme';

export default function BrowseTabScreen() {
  return (
    <DemoScreen title="Browse" subtitle="Vendors and materials across Jaipur East">
      <View style={styles.search}>
        <SearchBar placeholder="Search vendors, stones, pipes…" />
      </View>

      <Text variant="label" color={Colors.tangerine}>
        Top vendors
      </Text>
      <View style={styles.list}>
        {DEMO_VENDORS.map((vendor) => (
          <DemoVendorCard
            key={vendor.id}
            name={vendor.name}
            subtitle={vendor.category}
            onPress={() => router.push(ROUTES.screens.productDetail)}
          />
        ))}
      </View>
    </DemoScreen>
  );
}

const styles = StyleSheet.create({
  search: {
    marginTop: -Spacing.sm,
  },
  list: {
    gap: Spacing.sm + 2,
    marginTop: -Spacing.sm,
  },
});
