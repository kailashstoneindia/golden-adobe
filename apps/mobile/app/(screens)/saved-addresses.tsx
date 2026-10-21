import { DemoScreen } from '../../src/components/demo/DemoScreen';
import { EmptyStateCard } from '../../src/components/ui';
import { EMPTY_STATE_MESSAGES } from '../../src/constants';

export default function SavedAddressesScreen() {
  return (
    <DemoScreen
      title="Saved addresses"
      subtitle="Delivery locations tied to your projects"
      showBack
    >
      <EmptyStateCard title="No saved addresses" message={EMPTY_STATE_MESSAGES.addressesEmpty} />
    </DemoScreen>
  );
}
