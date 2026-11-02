import type { VendorOrderGroupDto } from '@golden-abode/types';
import { ORDER_VENDOR_GROUP_STATUSES, Role } from '@golden-abode/types';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ArtisanCard } from '../../src/components/artisans';
import { CategoryGrid } from '../../src/components/customer/CategoryGrid';
import { ProjectPill } from '../../src/components/customer/ProjectPill';
import { SearchBar } from '../../src/components/customer/SearchBar';
import { VendorGroupListRow } from '../../src/components/orders';
import { Card, EmptyStateCard, Text } from '../../src/components/ui';
import {
  ARTISAN_CONSTANTS,
  EMPTY_STATE_MESSAGES,
  ERROR_MESSAGES,
  ROUTES,
  TOAST_MESSAGES,
  TRADE_TYPE_LABELS,
  type LaunchCategory,
} from '../../src/constants';
import {
  useArtisanHireRequestsQuery,
  useArtisanProfileQuery,
  useArtisanSearchQuery,
  useUpdateArtisanProfileMutation,
} from '../../src/hooks/artisans';
import { useAuth } from '../../src/hooks/auth';
import { useToast } from '../../src/hooks/useToast';
import { useVendorOrderGroupsQuery } from '../../src/hooks/orders';
import { usePendingConfirmationsQuery, useVendorListingsQuery } from '../../src/hooks/vendor';
import {
  selectHasSearchLocation,
  useLocationPreferenceStore,
} from '../../src/stores/location-preference.store';
import { Colors, Radius, Spacing } from '../../src/theme';
import type { PendingOrdersPreviewProps } from '../../src/types';
import {
  getApiErrorMessage,
  isActiveArtisanJob,
  navigateToArtisanProfile,
  navigateToCatalogSearch,
  navigateToLocationGate,
  navigateToOrderDetail,
} from '../../src/utils';

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

  if (user?.role === Role.ARTISAN) {
    return <ArtisanHome />;
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

        <UstaadsPreview pincode={preference.pincode} />

        <Text variant="h3" style={styles.sectionHeaderTitle}>
          Top vendors nearby
        </Text>
        <EmptyStateCard message={EMPTY_STATE_MESSAGES.homeVendorsEmpty} />
      </ScrollView>
    </View>
  );
}

function UstaadsPreview({ pincode }: Readonly<{ pincode: string | null }>) {
  const searchQuery = useArtisanSearchQuery(
    { pincode: pincode ?? undefined },
    ARTISAN_CONSTANTS.homePreviewCount,
  );
  const artisans = searchQuery.data?.items ?? [];
  const handleSeeAllPress = () => router.push(ROUTES.screens.findUstaad);

  return (
    <>
      <SectionHeader
        title="Verified Ustaads nearby"
        actionLabel="See all"
        onActionPress={handleSeeAllPress}
      />
      {artisans.length === 0 ? (
        <EmptyStateCard message={EMPTY_STATE_MESSAGES.homeUstaadsEmpty} />
      ) : (
        artisans.map((artisan) => (
          <ArtisanCard key={artisan.id} artisan={artisan} onPress={navigateToArtisanProfile} />
        ))
      )}
    </>
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

        <PendingOrdersPreview onSeeAllPress={handleOrdersPress} />
      </ScrollView>
    </View>
  );
}

function ArtisanHome() {
  const profileQuery = useArtisanProfileQuery(true);
  const jobsQuery = useArtisanHireRequestsQuery(true);
  const updateProfile = useUpdateArtisanProfileMutation();
  const { showSuccess, showError } = useToast();
  const profile = profileQuery.data;
  const jobs = jobsQuery.data ?? [];
  const activeCount = jobs.filter((job) => isActiveArtisanJob(job.status)).length;
  const completedCount = jobs.filter((job) => job.status === 'COMPLETED').length;

  const handleJobsPress = () => router.push(ROUTES.tabs.orders);
  const handleProfilePress = () => router.push(ROUTES.screens.artisanProfile);

  const handleAvailabilityChange = (isAvailable: boolean) => {
    updateProfile.mutate(
      { isAvailable },
      {
        onSuccess: () => showSuccess(TOAST_MESSAGES.availabilityUpdated),
        onError: (error) =>
          showError(getApiErrorMessage(error, ERROR_MESSAGES.artisanProfileSaveFailed)),
      },
    );
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <SafeAreaView edges={['top']}>
          <Text variant="caption" color="rgba(255,255,255,0.65)" style={styles.greeting}>
            Ustaad
          </Text>
          <Text variant="h2" color={Colors.white}>
            {profile ? TRADE_TYPE_LABELS[profile.tradeType] : 'Your work'}
          </Text>
          <Text variant="caption" color="rgba(255,255,255,0.65)" style={styles.vendorMeta}>
            {profile?.servicePincode
              ? `Serving ${profile.servicePincode}`
              : 'Manage your jobs and availability'}
          </Text>
        </SafeAreaView>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        {profile && !profile.isVerified ? (
          <Pressable onPress={handleProfilePress}>
            <Card style={styles.statCard}>
              <Text variant="bodyMedium">Verification pending</Text>
              <Text variant="caption" color={Colors.inkSoft}>
                {profile.documentUrl
                  ? 'Your document is with the admin team. Customers can find you once you are verified.'
                  : 'Upload a verification document so the admin team can verify you.'}
              </Text>
            </Card>
          </Pressable>
        ) : null}

        {profile ? (
          <Card style={styles.availabilityCard}>
            <View style={styles.availabilityText}>
              <Text variant="bodyMedium">Available for new jobs</Text>
              <Text variant="caption" color={Colors.inkSoft}>
                Turn off when you are fully booked
              </Text>
            </View>
            <Switch
              value={profile.isAvailable}
              disabled={updateProfile.isPending}
              onValueChange={handleAvailabilityChange}
              trackColor={{ true: Colors.sage, false: Colors.line }}
            />
          </Card>
        ) : null}

        <View style={styles.statsRow}>
          <Pressable style={styles.statPressable} onPress={handleJobsPress}>
            <Card style={styles.statCard}>
              <Text variant="numericSm">{activeCount}</Text>
              <Text variant="caption">Active jobs</Text>
            </Card>
          </Pressable>
          <Pressable style={styles.statPressable} onPress={handleJobsPress}>
            <Card style={styles.statCard}>
              <Text variant="numericSm">{completedCount}</Text>
              <Text variant="caption">Completed</Text>
            </Card>
          </Pressable>
        </View>

        <Pressable onPress={handleProfilePress}>
          <Card>
            <Text variant="bodyMedium">Manage profile</Text>
            <Text variant="caption" color={Colors.inkSoft}>
              Trade, service area, document, team and bank details
            </Text>
          </Card>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function PendingOrdersPreview({ onSeeAllPress }: PendingOrdersPreviewProps) {
  const groupsQuery = useVendorOrderGroupsQuery(true);
  const vendorGroups: VendorOrderGroupDto[] = groupsQuery.data ?? [];
  const pendingGroups = vendorGroups.filter(isPendingVendorGroup).slice(0, 3);

  return (
    <>
      <SectionHeader title="Pending orders" actionLabel="See all" onActionPress={onSeeAllPress} />
      {pendingGroups.length === 0 ? (
        <EmptyStateCard message={EMPTY_STATE_MESSAGES.homePendingOrdersEmpty} />
      ) : (
        pendingGroups.map((group: VendorOrderGroupDto) => (
          <VendorGroupListRow key={group.id} group={group} onPress={navigateToOrderDetail} />
        ))
      )}
    </>
  );
}

function isPendingVendorGroup(group: VendorOrderGroupDto): boolean {
  return (
    group.status === ORDER_VENDOR_GROUP_STATUSES.PENDING ||
    group.status === ORDER_VENDOR_GROUP_STATUSES.CONFIRMED
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
  availabilityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  availabilityText: {
    flex: 1,
    gap: Spacing.xs,
  },
});
