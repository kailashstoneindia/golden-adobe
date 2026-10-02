import { DemoScreen } from '../../src/components/demo/DemoScreen';
import { EmptyStateCard } from '../../src/components/ui';
import { EMPTY_STATE_MESSAGES } from '../../src/constants';

export default function ShopTabScreen() {
  return (
    <DemoScreen title="Shop profile" subtitle="How customers see your business on Kailash Stones">
      <EmptyStateCard
        title="Shop profile unavailable"
        message={EMPTY_STATE_MESSAGES.shopProfileEmpty}
      />
    </DemoScreen>
  );
}
