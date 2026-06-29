import { StyleSheet, View } from 'react-native';

import { DemoScreen } from '../../src/components/demo/DemoScreen';
import { Button, Card, Text } from '../../src/components/ui';
import { Colors, Spacing } from '../../src/theme';

export default function CheckoutScreen() {
  return (
    <DemoScreen
      title="Checkout"
      showBack
      footer={<Button title="Pay ₹5,380" fullWidth onPress={() => {}} />}
    >
      <Text variant="label" color={Colors.tangerine}>
        Delivering to project
      </Text>
      <Card>
        <Text variant="h3">Sharma Residence</Text>
        <Text variant="caption" style={styles.line}>
          Plot 14, Vaishali Nagar, Jaipur East
        </Text>
        <Text variant="caption" color={Colors.sky} style={styles.link}>
          Change project
        </Text>
      </Card>

      <Text variant="label" color={Colors.tangerine} style={styles.section}>
        Payment method
      </Text>
      <View style={styles.list}>
        {['UPI', 'Card', 'Netbanking'].map((method, index) => (
          <Card key={method} style={index === 0 ? styles.selected : undefined}>
            <View style={styles.payRow}>
              <Text variant="bodyMedium">{method}</Text>
              <View style={[styles.radio, index === 0 && styles.radioOn]} />
            </View>
          </Card>
        ))}
      </View>

      <Text variant="caption" color={Colors.subtle}>
        Secured by Razorpay
      </Text>

      <View style={styles.totals}>
        <View style={styles.totalRow}>
          <Text variant="caption">Items total</Text>
          <Text variant="numericSm">₹5,260</Text>
        </View>
        <View style={styles.totalRow}>
          <Text variant="caption">Delivery (2 vendors)</Text>
          <Text variant="numericSm">₹120</Text>
        </View>
      </View>
    </DemoScreen>
  );
}

const styles = StyleSheet.create({
  line: {
    marginTop: Spacing.xs,
  },
  link: {
    marginTop: Spacing.sm,
  },
  section: {
    marginTop: Spacing.sm,
  },
  list: {
    gap: Spacing.sm,
    marginTop: -Spacing.sm,
  },
  selected: {
    borderColor: Colors.tangerine,
  },
  payRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  radio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: Colors.line,
  },
  radioOn: {
    borderColor: Colors.tangerine,
    backgroundColor: Colors.tangerine,
  },
  totals: {
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
