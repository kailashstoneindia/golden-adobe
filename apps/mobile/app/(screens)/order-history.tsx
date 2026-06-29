import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { DemoScreen } from '../../src/components/demo/DemoScreen';
import { DemoOrderCard } from '../../src/components/demo/DemoCards';
import { ROUTES } from '../../src/constants';
import { DEMO_CUSTOMER_ORDERS } from '../../src/data/demo-content';
import { Spacing } from '../../src/theme';

export default function OrderHistoryScreen() {
  return (
    <DemoScreen title="Order history" subtitle="Past and active orders for your projects" showBack>
      <View style={styles.list}>
        {DEMO_CUSTOMER_ORDERS.map((order) => (
          <DemoOrderCard
            key={order.id}
            order={order}
            onPress={() =>
              router.push({ pathname: ROUTES.screens.orderDetail, params: { id: order.id } })
            }
          />
        ))}
      </View>
    </DemoScreen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.sm + 2,
  },
});
