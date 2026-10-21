import { DemoScreen } from '../../src/components/demo/DemoScreen';
import { EmptyStateCard } from '../../src/components/ui';
import { EMPTY_STATE_MESSAGES } from '../../src/constants';

export default function OrderDetailScreen() {
  return (
    <DemoScreen title="Order details" showBack>
      <EmptyStateCard
        title="Order not available"
        message={EMPTY_STATE_MESSAGES.orderDetailUnavailable}
      />
    </DemoScreen>
  );
}
