import { StyleSheet, View } from 'react-native';

import { DemoScreen } from '../../src/components/demo/DemoScreen';
import { Badge, Card, Text } from '../../src/components/ui';
import { Colors, Spacing } from '../../src/theme';

export default function ShopTabScreen() {
  return (
    <DemoScreen title="Shop profile" subtitle="How customers see your business on Kailash Stones">
      <View style={styles.hero} />

      <Card>
        <View style={styles.shopHeader}>
          <Text variant="h2">Kailash Stones</Text>
          <Badge label="Verified" variant="success" />
        </View>
        <Text variant="caption" color={Colors.inkSoft}>
          Stones & Tiles · Jaipur East · 4.8★
        </Text>
        <Text variant="body" style={styles.bio}>
          Family-run stone yard since 1998. Kota, marble, and granite for residential builds across
          Vaishali Nagar and C-Scheme.
        </Text>
      </Card>

      <Text variant="label" color={Colors.tangerine}>
        Delivery areas
      </Text>
      <Card>
        <Text variant="bodyMedium">Jaipur East</Text>
        <Text variant="caption" color={Colors.inkSoft} style={styles.line}>
          Vaishali Nagar, Malviya Nagar, C-Scheme
        </Text>
      </Card>

      <Text variant="label" color={Colors.tangerine}>
        Business hours
      </Text>
      <Card>
        <Text variant="bodyMedium">Mon – Sat · 9:00 AM – 7:00 PM</Text>
        <Text variant="caption" color={Colors.inkSoft} style={styles.line}>
          Closed Sundays
        </Text>
      </Card>
    </DemoScreen>
  );
}

const styles = StyleSheet.create({
  hero: {
    height: 120,
    borderRadius: 14,
    backgroundColor: Colors.tangerineTint,
    marginTop: Spacing.xs,
  },
  shopHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  bio: {
    marginTop: Spacing.sm,
  },
  line: {
    marginTop: Spacing.xs,
  },
});
