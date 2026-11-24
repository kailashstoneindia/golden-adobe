import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { EMPTY_STATE_MESSAGES, ERROR_MESSAGES, type DriverJobScope } from '../../constants';
import { useDriverDeliveriesQuery } from '../../hooks/delivery';
import { Colors, Spacing } from '../../theme';
import { navigateToDeliveryJob } from '../../utils/delivery';
import { DemoScreen } from '../demo/DemoScreen';
import { Chip, EmptyStateCard, Text } from '../ui';
import { DeliveryJobRow } from './DeliveryJobRow';

const SCOPE_TABS: { scope: DriverJobScope; label: string }[] = [
  { scope: 'active', label: 'Active' },
  { scope: 'history', label: 'History' },
];

/** The driver's home: jobs to do now, and finished ones. */
export function DriverJobsScreen() {
  const [scope, setScope] = useState<DriverJobScope>('active');
  const jobsQuery = useDriverDeliveriesQuery(scope);
  const jobs = jobsQuery.data ?? [];
  const refresh = () => jobsQuery.refetch();

  return (
    <DemoScreen title="Deliveries" subtitle="Pull down to check for new jobs" onRefresh={refresh}>
      <View style={styles.tabs}>
        {SCOPE_TABS.map((tab) => (
          <Chip
            key={tab.scope}
            label={tab.label}
            isSelected={scope === tab.scope}
            onPress={() => setScope(tab.scope)}
          />
        ))}
      </View>

      {jobsQuery.isLoading ? (
        <Text variant="body" color={Colors.inkSoft}>
          Loading deliveries…
        </Text>
      ) : jobsQuery.isError ? (
        <EmptyStateCard title="Could not load jobs" message={ERROR_MESSAGES.driverJobsFailed} />
      ) : jobs.length === 0 ? (
        <EmptyStateCard
          title={scope === 'active' ? 'No deliveries right now' : 'No finished deliveries yet'}
          message={
            scope === 'active'
              ? EMPTY_STATE_MESSAGES.driverActiveJobsEmpty
              : EMPTY_STATE_MESSAGES.driverHistoryEmpty
          }
        />
      ) : (
        jobs.map((job) => <DeliveryJobRow key={job.id} job={job} onPress={navigateToDeliveryJob} />)
      )}
    </DemoScreen>
  );
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
});
