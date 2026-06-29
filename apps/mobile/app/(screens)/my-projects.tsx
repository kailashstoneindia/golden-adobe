import { StyleSheet, View } from 'react-native';

import { DemoScreen } from '../../src/components/demo/DemoScreen';
import { DemoOrderCard } from '../../src/components/demo/DemoCards';
import { Badge, Card, Text } from '../../src/components/ui';
import { ROUTES } from '../../src/constants';
import { DEMO_ACTIVE_PROJECTS, DEMO_PROJECTS } from '../../src/data/demo-content';
import { Colors, Spacing } from '../../src/theme';

export default function MyProjectsScreen() {
  return (
    <DemoScreen title="My projects" subtitle="Sites you're currently working on" showBack>
      <View style={styles.list}>
        {DEMO_ACTIVE_PROJECTS.map((project) => (
          <Card key={project.name}>
            <View style={styles.cardTop}>
              <Text variant="bodyMedium" style={styles.cardTitle}>
                {project.name}
              </Text>
              <Badge label={project.status} variant={project.badge} />
            </View>
            <Text variant="caption" style={styles.detail}>
              {project.detail}
            </Text>
          </Card>
        ))}
      </View>

      <Text variant="h3" style={styles.section}>
        All projects
      </Text>
      <View style={styles.list}>
        {DEMO_PROJECTS.map((project) => (
          <Card key={project.name}>
            <View style={styles.cardTop}>
              <Text variant="bodyMedium" style={styles.cardTitle}>
                {project.name}
              </Text>
              <Badge label={project.status} variant={project.badge} />
            </View>
            <Text variant="caption" style={styles.detail}>
              {project.detail}
            </Text>
          </Card>
        ))}
      </View>
    </DemoScreen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.sm + 2,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  cardTitle: {
    fontSize: 14,
    flex: 1,
  },
  detail: {
    marginTop: Spacing.xs + 2,
  },
  section: {
    marginTop: Spacing.sm,
  },
});
