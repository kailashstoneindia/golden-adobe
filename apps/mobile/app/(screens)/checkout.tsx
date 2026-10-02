import { DemoScreen } from '../../src/components/demo/DemoScreen';
import { EmptyStateCard } from '../../src/components/ui';
import { EMPTY_STATE_MESSAGES } from '../../src/constants';

export default function CheckoutScreen() {
  return (
    <DemoScreen title="Checkout" showBack>
      <EmptyStateCard title="Nothing to checkout" message={EMPTY_STATE_MESSAGES.checkoutEmpty} />
    </DemoScreen>
  );
}
