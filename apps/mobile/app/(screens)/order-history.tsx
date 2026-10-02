import { DemoScreen } from '../../src/components/demo/DemoScreen';
import { EmptyStateCard } from '../../src/components/ui';
import { EMPTY_STATE_MESSAGES } from '../../src/constants';

export default function OrderHistoryScreen() {
  return (
    <DemoScreen title="Order history" subtitle="Past and active orders for your projects" showBack>
      <EmptyStateCard title="No past orders" message={EMPTY_STATE_MESSAGES.orderHistoryEmpty} />
    </DemoScreen>
  );
}
