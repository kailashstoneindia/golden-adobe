import { Role } from '@golden-abode/types';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { DemoScreen } from '../../src/components/demo/DemoScreen';
import { DemoOrderCard } from '../../src/components/demo/DemoCards';
import { Button, Text } from '../../src/components/ui';
import { ROUTES } from '../../src/constants';
import { DEMO_CUSTOMER_ORDERS, DEMO_VENDOR_ORDERS } from '../../src/data/demo-content';
import { useAuth } from '../../src/hooks/auth';
import { Colors, Spacing } from '../../src/theme';

export default function OrdersTabScreen() {
  const { user } = useAuth();
  const isVendor = user?.role === Role.VENDOR;
  const orders = isVendor ? DEMO_VENDOR_ORDERS : DEMO_CUSTOMER_ORDERS;

  return (
    <DemoScreen
      title="Orders"
      subtitle={
        isVendor
          ? 'Incoming requests from customers on your shop'
          : 'Track active deliveries and review past orders'
      }
    >
      <View style={styles.list}>
        {orders.map((order) => (
          <DemoOrderCard
            key={order.id}
            order={order}
            onPress={() =>
              router.push({ pathname: ROUTES.screens.orderDetail, params: { id: order.id } })
            }
            actions={
              isVendor && order.status === 'New' ? (
                <>
                  <Button title="Confirm" onPress={() => {}} />
                  <Button title="Decline" variant="ghost" onPress={() => {}} />
                </>
              ) : undefined
            }
          />
        ))}
      </View>

      {!isVendor ? (
        <Text variant="caption" color={Colors.inkSoft}>
          Tap an order to open the Ridge Tracker demo.
        </Text>
      ) : null}
    </DemoScreen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.sm + 2,
  },
});
