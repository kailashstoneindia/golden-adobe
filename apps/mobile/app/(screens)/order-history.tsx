import { ORDER_STATUSES, Role } from '@golden-abode/types';
import { useCallback } from 'react';

import { DemoScreen } from '../../src/components/demo/DemoScreen';
import { OrderListRow } from '../../src/components/orders';
import { EmptyStateCard, Text } from '../../src/components/ui';
import { EMPTY_STATE_MESSAGES, ERROR_MESSAGES } from '../../src/constants';
import { useAuth } from '../../src/hooks/auth';
import { useOrdersQuery } from '../../src/hooks/orders';
import { Colors } from '../../src/theme';
import { navigateToOrderDetail } from '../../src/utils';

const HISTORY_STATUSES = [
  ORDER_STATUSES.CONFIRMED,
  ORDER_STATUSES.CANCELLED,
  ORDER_STATUSES.REFUNDED,
] as const;

export default function OrderHistoryScreen() {
  const { user } = useAuth();
  const isCustomer = user?.role === Role.CUSTOMER;
  const ordersQuery = useOrdersQuery(isCustomer);
  const handlePress = useCallback((orderId: string) => {
    navigateToOrderDetail(orderId);
  }, []);

  if (!isCustomer) {
    return (
      <DemoScreen title="Order history" showBack>
        <EmptyStateCard title="No past orders" message={EMPTY_STATE_MESSAGES.orderHistoryEmpty} />
      </DemoScreen>
    );
  }

  if (ordersQuery.isLoading) {
    return (
      <DemoScreen title="Order history" showBack>
        <Text variant="body" color={Colors.inkSoft}>
          Loading orders…
        </Text>
      </DemoScreen>
    );
  }

  if (ordersQuery.isError) {
    return (
      <DemoScreen title="Order history" showBack>
        <EmptyStateCard title="Could not load orders" message={ERROR_MESSAGES.ordersFailed} />
      </DemoScreen>
    );
  }

  const historyOrders = (ordersQuery.data ?? []).filter((order) =>
    HISTORY_STATUSES.some((status) => status === order.status),
  );

  if (historyOrders.length === 0) {
    return (
      <DemoScreen title="Order history" subtitle="Completed, cancelled, and refunded orders" showBack>
        <EmptyStateCard title="No past orders" message={EMPTY_STATE_MESSAGES.orderHistoryEmpty} />
      </DemoScreen>
    );
  }

  return (
    <DemoScreen title="Order history" subtitle="Completed, cancelled, and refunded orders" showBack>
      {historyOrders.map((order) => (
        <OrderListRow key={order.id} order={order} onPress={handlePress} />
      ))}
    </DemoScreen>
  );
}
