import { StyleSheet, View } from 'react-native';

import { DemoScreen } from '../../src/components/demo/DemoScreen';
import { Badge, Card, Text } from '../../src/components/ui';
import { DEMO_ADDRESSES } from '../../src/data/demo-content';
import { Colors, Spacing } from '../../src/theme';

export default function SavedAddressesScreen() {
  return (
    <DemoScreen title="Saved addresses" subtitle="Delivery locations tied to your projects" showBack>
      <View style={styles.list}>
        {DEMO_ADDRESSES.map((address) => (
          <Card key={address.label}>
            <View style={styles.cardTop}>
              <Text variant="bodyMedium">{address.label}</Text>
              {address.isDefault ? <Badge label="Default" variant="info" /> : null}
            </View>
            <Text variant="caption" style={styles.line}>
              {address.line}
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
    alignItems: 'center',
    gap: Spacing.sm,
  },
  line: {
    marginTop: Spacing.xs + 2,
  },
});
