import { DemoScreen } from '../../src/components/demo/DemoScreen';
import { EmptyStateCard } from '../../src/components/ui';
import { EMPTY_STATE_MESSAGES } from '../../src/constants';

export default function CartTabScreen() {
  return (
    <DemoScreen title="Your cart" subtitle="Items grouped by vendor before checkout">
      <EmptyStateCard title="Cart is empty" message={EMPTY_STATE_MESSAGES.cartEmpty} />
    </DemoScreen>
  );
}
