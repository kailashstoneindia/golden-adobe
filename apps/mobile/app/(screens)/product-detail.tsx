import { StyleSheet, View } from 'react-native';

import { DemoScreen } from '../../src/components/demo/DemoScreen';
import { Button, Card, Text } from '../../src/components/ui';
import { Colors, Spacing } from '../../src/theme';

export default function ProductDetailScreen() {
  return (
    <DemoScreen
      title="Kota Stone, Beige"
      subtitle="Kailash Stones · Stones & Tiles"
      showBack
      footer={<Button title="Add to cart · ₹3,400" fullWidth onPress={() => {}} />}
    >
      <View style={styles.hero} />

      <Card>
        <Text variant="numeric">₹68</Text>
        <Text variant="caption" color={Colors.inkSoft}>
          per sq ft · polished finish
        </Text>
        <Text variant="body" style={styles.desc}>
          Natural beige Kota stone, 12mm thickness, polished finish. Ideal for flooring in
          residential projects across Jaipur East.
        </Text>
      </Card>

      <Card>
        <Text variant="bodyMedium">Specifications</Text>
        <Text variant="caption" color={Colors.inkSoft} style={styles.spec}>
          Thickness: 12 mm
        </Text>
        <Text variant="caption" color={Colors.inkSoft} style={styles.spec}>
          Finish: Polished
        </Text>
        <Text variant="caption" color={Colors.inkSoft} style={styles.spec}>
          In stock: 800 sq ft
        </Text>
      </Card>
    </DemoScreen>
  );
}

const styles = StyleSheet.create({
  hero: {
    height: 180,
    borderRadius: 14,
    backgroundColor: Colors.skyTint,
    marginTop: Spacing.xs,
  },
  desc: {
    marginTop: Spacing.sm,
  },
  spec: {
    marginTop: Spacing.xs,
  },
});
