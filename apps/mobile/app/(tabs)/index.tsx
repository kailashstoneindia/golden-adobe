import { Role } from '@golden-abode/types';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CategoryGrid } from '../../src/components/customer/CategoryGrid';
import { HorizontalCardList } from '../../src/components/customer/HorizontalCardList';
import { ProjectPill } from '../../src/components/customer/ProjectPill';
import { SearchBar } from '../../src/components/customer/SearchBar';
import { Badge, Card, Text } from '../../src/components/ui';
import { useAuth } from '../../src/hooks/auth';
import { Colors, Radius, Spacing } from '../../src/theme';

const USTAADS = [
  { id: '1', title: 'Ramesh Kumar', subtitle: 'Plumbing · 6 yrs' },
  { id: '2', title: "Bittu's Team", subtitle: 'Electrical · Group' },
];

const VENDORS = [
  { id: '1', title: 'Kailash Stones', subtitle: 'Stones · 4.8★' },
  { id: '2', title: 'Sharma Hardware', subtitle: 'Hardware · 4.6★' },
];

const PENDING_ORDERS = [
  { id: 'GA1042', customer: 'Sharma Residence', items: '3 items', status: 'Confirm' as const },
  { id: 'GA1039', customer: 'Mehta Residence', items: '1 item', status: 'Dispatched' as const },
];

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
  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <SafeAreaView edges={['top']}>
          <Text variant="caption" color="rgba(255,255,255,0.65)" style={styles.greeting}>
            {getGreeting()}, {firstName}
          </Text>
          <ProjectPill label="Sharma Residence, Vaishali Nagar" />
          <View style={styles.searchWrap}>
            <SearchBar />
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
        <CategoryGrid />

        <SectionHeader title="Verified Ustaads nearby" actionLabel="See all" />
        <HorizontalCardList items={USTAADS} />

        <SectionHeader title="Top vendors, Jaipur East" />
        <HorizontalCardList items={VENDORS} />
      </ScrollView>
    </View>
  );
}

function VendorHome() {
  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <SafeAreaView edges={['top']}>
          <Text variant="caption" color="rgba(255,255,255,0.65)" style={styles.greeting}>
            Kailash Stones
          </Text>
          <Text variant="h2" color={Colors.white}>
            Shop dashboard
          </Text>
          <Text variant="caption" color="rgba(255,255,255,0.65)" style={styles.vendorMeta}>
            Jaipur East · Stones & Tiles
          </Text>
        </SafeAreaView>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.statsRow}>
          <Card style={styles.statCard}>
            <Text variant="numericSm">12</Text>
            <Text variant="caption">Active products</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text variant="numericSm">2</Text>
            <Text variant="caption">Pending orders</Text>
          </Card>
        </View>

        <SectionHeader title="Pending orders" actionLabel="See all" />
        <View style={styles.orderList}>
          {PENDING_ORDERS.map((order) => (
            <Card key={order.id}>
              <View style={styles.orderTop}>
                <View>
                  <Text variant="bodyMedium" style={styles.orderId}>
                    #{order.id}
                  </Text>
                  <Text variant="caption">
                    {order.customer} · {order.items}
                  </Text>
                </View>
                <Badge
                  label={order.status}
                  variant={order.status === 'Confirm' ? 'pending' : 'info'}
                />
              </View>
            </Card>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function SectionHeader({ title, actionLabel }: { title: string; actionLabel?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text variant="h3">{title}</Text>
      {actionLabel ? (
        <Text variant="label" color={Colors.tangerine} style={styles.seeAll}>
          {actionLabel}
        </Text>
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
  statCard: {
    flex: 1,
    gap: Spacing.xs,
  },
  orderList: {
    gap: Spacing.sm + 2,
  },
  orderTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  orderId: {
    fontSize: 14,
  },
});
