import { HireRequestListRow } from '../../src/components/artisans';
import { DemoScreen } from '../../src/components/demo/DemoScreen';
import { EmptyStateCard, Text } from '../../src/components/ui';
import { EMPTY_STATE_MESSAGES, ERROR_MESSAGES } from '../../src/constants';
import { useCustomerHireRequestsQuery } from '../../src/hooks/artisans';
import { Colors } from '../../src/theme';
import { navigateToHireRequestDetail } from '../../src/utils';

const SUBTITLE = 'Every request is reviewed by our team before the Ustaad is notified';

export default function HireRequestsScreen() {
  const requestsQuery = useCustomerHireRequestsQuery(true);

  if (requestsQuery.isLoading) {
    return (
      <DemoScreen title="Hired Ustaads" subtitle={SUBTITLE} showBack>
        <Text variant="body" color={Colors.inkSoft}>
          Loading hire requests…
        </Text>
      </DemoScreen>
    );
  }

  if (requestsQuery.isError) {
    return (
      <DemoScreen title="Hired Ustaads" showBack>
        <EmptyStateCard
          title="Could not load hire requests"
          message={ERROR_MESSAGES.hireRequestsFailed}
        />
      </DemoScreen>
    );
  }

  const requests = requestsQuery.data ?? [];

  return (
    <DemoScreen title="Hired Ustaads" subtitle={SUBTITLE} showBack>
      {requests.length === 0 ? (
        <EmptyStateCard message={EMPTY_STATE_MESSAGES.customerHireRequestsEmpty} />
      ) : (
        requests.map((request) => (
          <HireRequestListRow
            key={request.id}
            request={request}
            onPress={navigateToHireRequestDetail}
          />
        ))
      )}
    </DemoScreen>
  );
}
