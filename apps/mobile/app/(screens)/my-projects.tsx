import { DemoScreen } from '../../src/components/demo/DemoScreen';
import { EmptyStateCard } from '../../src/components/ui';
import { EMPTY_STATE_MESSAGES } from '../../src/constants';

export default function MyProjectsScreen() {
  return (
    <DemoScreen title="My projects" subtitle="Sites you're currently working on" showBack>
      <EmptyStateCard title="No projects yet" message={EMPTY_STATE_MESSAGES.projectsEmpty} />
    </DemoScreen>
  );
}
