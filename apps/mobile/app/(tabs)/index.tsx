import { Role } from '@golden-abode/types';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CategoryGrid } from '../../src/components/customer/CategoryGrid';
import { ProjectPill } from '../../src/components/customer/ProjectPill';
import { SearchBar } from '../../src/components/customer/SearchBar';
import { Card, EmptyStateCard, Text } from '../../src/components/ui';
import { EMPTY_STATE_MESSAGES, ROUTES, type LaunchCategory } from '../../src/constants';
import { useAuth } from '../../src/hooks/auth';
import { usePendingConfirmationsQuery, useVendorListingsQuery } from '../../src/hooks/vendor';
import {
  selectHasSearchLocation,
  useLocationPreferenceStore,
} from '../../src/stores/location-preference.store';
import { Colors, Radius, Spacing } from '../../src/theme';
import { navigateToCatalogSearch, navigateToLocationGate } from '../../src/utils';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeTabScreen() {
  const { user } = useAuth();

  if (user?.role === Role.VENDOR) {
    return <VendorHome />;
  }

  return <CustomerHome firstName={user?.name.split(' ')[0] ?? 'there'} />;
}

function CustomerHome({ firstName }: { firstName: string }) {
  const preference = useLocationPreferenceStore((store) => store.preference);
  const hasSearchLocation = useLocationPreferenceStore(selectHasSearchLocation);
  const locationLabel = buildHomeLocationLabel(preference.pincode, hasSearchLocation);

  const handleSearchPress = () => navigateToCatalogSearch();
  const handleLocationPress = () => navigateToLocationGate();
  const handleCategoryPress = (category: LaunchCategory) =>
    navigateToCatalogSearch({ category: category.path });

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <SafeAreaView edges={['top']}>
          <Text variant="caption" color="rgba(255,255,255,0.65)" style={styles.greeting}>
            {getGreeting()}, {firstName}
          </Text>
          <ProjectPill label={locationLabel} onPress={handleLocationPress} />
          <View style={styles.searchWrap}>
            <SearchBar onPress={handleSearchPress} />
          </View>
        </SafeAreaView>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        <Text variant="h3" style={styles.sectionTitle}>
          Categories
        </Text>
        <CategoryGrid onCategoryPress={handleCategoryPress} />

        <Text variant="h3" style={styles.sectionHeaderTitle}>
          Verified Ustaads nearby
        </Text>
        <EmptyStateCard message={EMPTY_STATE_MESSAGES.homeUstaadsEmpty} />

        <Text variant="h3" style={styles.sectionHeaderTitle}>
          Top vendors nearby
        </Text>
        <EmptyStateCard message={EMPTY_STATE_MESSAGES.homeVendorsEmpty} />
      </ScrollView>
    </View>
  );
}

function buildHomeLocationLabel(pincode: string | null, hasSearchLocation: boolean): string {
  if (pincode) {
    return `Deliver to ${pincode}`;
  }
  if (hasSearchLocation) {
    return 'Deliver near you';
  }
  return 'Set your area';
}

function VendorHome() {
  const listingsQuery = useVendorListingsQuery({ status: 'active' });
  const pendingQuery = usePendingConfirmationsQuery();
  const activeCount = listingsQuery.data?.total ?? 0;
  const pendingCount = pendingQuery.data?.length ?? 0;

  const handleOrdersPress = () => router.push(ROUTES.tabs.orders);
  const handleProductsPress = () => router.push(ROUTES.tabs.products);
  const handlePendingPress = () => router.push(ROUTES.screens.pendingConfirmations);
  const handleSyncPress = () => router.push(ROUTES.screens.catalogSync);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <SafeAreaView edges={['top']}>
          <Text variant="caption" color="rgba(255,255,255,0.65)" style={styles.greeting}>
            Vendor shop
          </Text>
          <Text variant="h2" color={Colors.white}>
            Shop dashboard
          </Text>
          <Text variant="caption" color="rgba(255,255,255,0.65)" style={styles.vendorMeta}>
            Manage listings, stock, and catalog sync
          </Text>
        </SafeAreaView>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.statsRow}>
          <Pressable style={styles.statPressable} onPress={handleProductsPress}>
            <Card style={styles.statCard}>
              <Text variant="numericSm">{activeCount}</Text>
              <Text variant="caption">Active listings</Text>
            </Card>
          </Pressable>
          <Pressable style={styles.statPressable} onPress={handlePendingPress}>
            <Card style={styles.statCard}>
              <Text variant="numericSm">{pendingCount}</Text>
              <Text variant="caption">Pending matches</Text>
            </Card>
          </Pressable>
        </View>

        <Pressable onPress={handleSyncPress}>
          <Card>
            <Text variant="bodyMedium">Sync catalog</Text>
            <Text variant="caption" color={Colors.inkSoft}>
              Download the master sheet, fill prices, and upload matches
            </Text>
          </Card>
        </Pressable>

        <SectionHeader
          title="Pending orders"
          actionLabel="See all"
          onActionPress={handleOrdersPress}
        />
        <EmptyStateCard message={EMPTY_STATE_MESSAGES.homePendingOrdersEmpty} />
      </ScrollView>
    </View>
  );
}

function SectionHeader({
  title,
  actionLabel,
  onActionPress,
}: Readonly<{
  title: string;
  actionLabel?: string;
  onActionPress?: () => void;
}>) {
  return (
    <View style={styles.sectionHeader}>
      <Text variant="h3">{title}</Text>
      {actionLabel ? (
        <Pressable onPress={onActionPress}>
          <Text variant="label" color={Colors.tangerine} style={styles.seeAll}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  header: {
    backgroundColor: Colors.navy,
    paddingHorizontal: Spacing.lg + 2,
    paddingBottom: Spacing.lg + 2,
    borderBottomLeftRadius: Radius.lg + 2,
    borderBottomRightRadius: Radius.lg + 2,
  },
  greeting: {
    marginBottom: Spacing.xs + 2,
    fontSize: 11.5,
  },
  vendorMeta: {
    marginTop: Spacing.xs,
    fontSize: 11.5,
  },
  searchWrap: {
    marginTop: Spacing.lg,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: Spacing.lg + 2,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxl,
    gap: Spacing.sm + 2,
  },
  sectionTitle: {
    marginBottom: 0,
  },
  sectionHeaderTitle: {
    marginTop: Spacing.xl + 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: Spacing.xl + 2,
  },
  seeAll: {
    fontSize: 11,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.sm + 2,
    marginTop: Spacing.sm,
  },
  statPressable: {
    flex: 1,
  },
  statCard: {
    gap: Spacing.xs,
  },
});
