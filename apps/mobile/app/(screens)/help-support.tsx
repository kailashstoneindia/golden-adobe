import { DemoScreen } from '../../src/components/demo/DemoScreen';
import { EmptyStateCard } from '../../src/components/ui';
import { EMPTY_STATE_MESSAGES } from '../../src/constants';

export default function HelpSupportScreen() {
  return (
    <DemoScreen
      title="Help & support"
      subtitle="Quick answers while we wire up live support"
      showBack
    >
      <EmptyStateCard
        title="Support coming soon"
        message={EMPTY_STATE_MESSAGES.helpSupportUnavailable}
      />
    </DemoScreen>
  );
}
