import { ScrollView, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Badge, Button, Card, Text, TextInput } from '../src/components/ui';
import { Colors, Spacing } from '../src/theme';

/**
 * Design-system preview. Temporary landing route that exercises the theme
 * tokens and base components so the visual language can be verified on device.
 * Real role-based screens and navigation replace this later.
 */
export default function DesignSystemPreview() {
  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.navy} />

      <View style={styles.header}>
        <SafeAreaView edges={['top']}>
          <Text variant="label" color={Colors.tangerine}>
            Kailash Stones
          </Text>
          <Text variant="h1" color={Colors.white} style={styles.headerTitle}>
            Design system
          </Text>
          <Text variant="body" color="rgba(255,255,255,0.7)">
            Foundations & base components
          </Text>
        </SafeAreaView>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text variant="label">Typography</Text>
        <Card style={styles.section}>
          <Text variant="display">Kota Stone, Beige</Text>
          <Text variant="h2" style={styles.gap}>
            Categories near you
          </Text>
          <Text variant="h3" style={styles.gap}>
            Vendor: Sharma Hardware
          </Text>
          <Text variant="body" style={styles.gap}>
            Natural beige stone, 12mm thickness, polished finish.
          </Text>
          <Text variant="caption" style={styles.gap}>
            Delivered to Sharma Residence · 2 days ago
          </Text>
          <Text variant="numeric" style={styles.gap}>
            ₹2,450.00
          </Text>
          <Text variant="numericSm" style={styles.gap}>
            Order #GA1042
          </Text>
        </Card>

        <Text variant="label" style={styles.section}>
          Buttons
        </Text>
        <View style={styles.stack}>
          <Button variant="primary" title="Place order" fullWidth />
          <Button variant="secondary" title="Add to cart" fullWidth />
          <Button variant="disabled" title="Withdraw — coming soon" fullWidth />
          <Button variant="ghost" title="View all 12 items" />
        </View>

        <Text variant="label" style={styles.section}>
          Status badges
        </Text>
        <View style={styles.row}>
          <Badge variant="pending" label="Processing" />
          <Badge variant="info" label="Out for delivery" />
          <Badge variant="success" label="Delivered" />
          <Badge variant="error" label="Payment failed" />
        </View>

        <Text variant="label" style={styles.section}>
          Inputs
        </Text>
        <Card>
          <TextInput label="Phone number" placeholder="98290 12345" keyboardType="phone-pad" />
        </Card>

        <Text variant="label" style={styles.section}>
          Card
        </Text>
        <Card>
          <View style={styles.cardTop}>
            <View style={styles.flex}>
              <Text variant="h3">Order #GA1042</Text>
              <Text variant="caption" style={styles.tight}>
                Sharma Residence · 6 items
              </Text>
            </View>
            <Badge variant="pending" label="Dispatched" />
          </View>
        </Card>

        <View style={styles.footerSpace} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    backgroundColor: Colors.navy,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
    borderBottomLeftRadius: Spacing.xxl,
    borderBottomRightRadius: Spacing.xxl,
  },
  headerTitle: {
    marginTop: Spacing.xs,
  },
  body: {
    padding: Spacing.xl,
  },
  section: {
    marginTop: Spacing.xxl,
    marginBottom: Spacing.sm,
  },
  stack: {
    gap: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  gap: {
    marginTop: Spacing.sm,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  flex: {
    flex: 1,
  },
  tight: {
    marginTop: Spacing.xs / 2,
  },
  footerSpace: {
    height: Spacing.xxxl,
  },
});
