import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';

import { DemoScreen } from '../../src/components/demo/DemoScreen';
import { Badge, Card, Text } from '../../src/components/ui';
import { DEMO_CUSTOMER_ORDERS } from '../../src/data/demo-content';
import { Colors, Spacing } from '../../src/theme';

const TRACK_STEPS = ['Placed', 'Confirmed', 'Dispatched', 'Out for delivery', 'Delivered'];

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const order = DEMO_CUSTOMER_ORDERS.find((item) => item.id === id) ?? DEMO_CUSTOMER_ORDERS[0];

  return (
    <DemoScreen
      title={`Order #${order.id}`}
      subtitle={`${order.customer} · ${order.summary}`}
      showBack
    >
      <Badge label={order.status} variant={order.badge} />

      <Card style={styles.tracker}>
        <Svg width="100%" height={140} viewBox="0 0 280 140">
          <Polyline
            points="20,120 75,80 130,95 185,40"
            fill="none"
            stroke={Colors.tangerine}
            strokeWidth={3}
            strokeLinecap="round"
          />
          <Polyline
            points="185,40 245,65"
            fill="none"
            stroke={Colors.line}
            strokeWidth={3}
            strokeDasharray="2 7"
            strokeLinecap="round"
          />
          <Circle cx="185" cy="20" r="14" fill={Colors.tangerineTint} opacity={0.55} />
          <Circle cx="20" cy="120" r="5" fill={Colors.tangerine} />
          <Circle cx="75" cy="80" r="5" fill={Colors.tangerine} />
          <Circle cx="130" cy="95" r="5" fill={Colors.tangerine} />
          <Circle cx="185" cy="40" r="7" fill={Colors.tangerine} stroke={Colors.white} strokeWidth={2} />
          <Circle cx="245" cy="65" r="5" fill={Colors.white} stroke={Colors.line} strokeWidth={2} />
        </Svg>
      </Card>

      <View style={styles.steps}>
        {TRACK_STEPS.map((step, index) => (
          <Text
            key={step}
            variant="caption"
            color={index === 3 ? Colors.tangerine : Colors.inkSoft}
            style={index === 3 ? styles.activeStep : undefined}
          >
            {step}
          </Text>
        ))}
      </View>

      <Card>
        <Text variant="bodyMedium">Delivery OTP</Text>
        <Text variant="numeric" style={styles.otp}>
          4 8 2 9 1 6
        </Text>
        <Text variant="caption" color={Colors.inkSoft}>
          Share with the driver when materials arrive on site.
        </Text>
      </Card>
    </DemoScreen>
  );
}

const styles = StyleSheet.create({
  tracker: {
    paddingVertical: Spacing.sm,
  },
  steps: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: -Spacing.sm,
  },
  activeStep: {
    fontFamily: undefined,
  },
  otp: {
    marginVertical: Spacing.sm,
    letterSpacing: 4,
  },
});
