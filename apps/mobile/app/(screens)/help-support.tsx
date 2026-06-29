import { StyleSheet, View } from 'react-native';

import { DemoScreen } from '../../src/components/demo/DemoScreen';
import { Card, Text } from '../../src/components/ui';
import { DEMO_FAQ } from '../../src/data/demo-content';
import { Colors, Spacing } from '../../src/theme';

export default function HelpSupportScreen() {
  return (
    <DemoScreen title="Help & support" subtitle="Quick answers while we wire up live support" showBack>
      <View style={styles.list}>
        {DEMO_FAQ.map((item) => (
          <Card key={item.q}>
            <Text variant="bodyMedium">{item.q}</Text>
            <Text variant="caption" color={Colors.inkSoft} style={styles.answer}>
              {item.a}
            </Text>
          </Card>
        ))}
      </View>

      <Card style={styles.contact}>
        <Text variant="label">Need more help?</Text>
        <Text variant="body" color={Colors.inkSoft} style={styles.contactBody}>
          Call +91 141 000 0000 or email support@kailashstones.in
        </Text>
      </Card>
    </DemoScreen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.sm + 2,
  },
  answer: {
    marginTop: Spacing.xs + 2,
  },
  contact: {
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  contactBody: {
    marginTop: Spacing.xs,
  },
});
