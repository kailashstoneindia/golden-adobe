import { Role } from '@golden-abode/types';
import { useCallback } from 'react';

import { DemoScreen } from '../../src/components/demo/DemoScreen';
import { OrderListRow, VendorGroupListRow } from '../../src/components/orders';
import { EmptyStateCard, Text } from '../../src/components/ui';
import { EMPTY_STATE_MESSAGES, ERROR_MESSAGES } from '../../src/constants';
import { useAuth } from '../../src/hooks/auth';
import { useOrdersQuery, useVendorOrderGroupsQuery } from '../../src/hooks/orders';
import { Colors } from '../../src/theme';
import { navigateToOrderDetail } from '../../src/utils';

export default function OrdersTabScreen() {
  const { user } = useAuth();
  const isVendor = user?.role === Role.VENDOR;

  if (isVendor) {
    return <VendorOrdersList />;
  }

  return <CustomerOrdersList />;
}

function CustomerOrdersList() {
  const ordersQuery = useOrdersQuery(true);
  const handlePress = useCallback((orderId: string) => {
    navigateToOrderDetail(orderId);
  }, []);

  if (ordersQuery.isLoading) {
    return (
      <DemoScreen title="Orders" subtitle="Track active deliveries and review past orders">
        <Text variant="body" color={Colors.inkSoft}>
          Loading orders…
        </Text>
      </DemoScreen>
    );
  }

  if (ordersQuery.isError) {
    return (
      <DemoScreen title="Orders">
        <EmptyStateCard title="Could not load orders" message={ERROR_MESSAGES.ordersFailed} />
      </DemoScreen>
    );
  }

  const orders = ordersQuery.data ?? [];
  if (orders.length === 0) {
    return (
      <DemoScreen title="Orders" subtitle="Track active deliveries and review past orders">
        <EmptyStateCard title="No orders yet" message={EMPTY_STATE_MESSAGES.ordersCustomerEmpty} />
      </DemoScreen>
    );
  }

  return (
    <DemoScreen title="Orders" subtitle="Track active deliveries and review past orders">
      {orders.map((order) => (
        <OrderListRow key={order.id} order={order} onPress={handlePress} />
      ))}
    </DemoScreen>
  );
}

function VendorOrdersList() {
  const groupsQuery = useVendorOrderGroupsQuery(true);
  const handlePress = useCallback((groupId: string) => {
    navigateToOrderDetail(groupId);
  }, []);

  if (groupsQuery.isLoading) {
    return (
      <DemoScreen title="Orders" subtitle="Incoming requests from customers on your shop">
        <Text variant="body" color={Colors.inkSoft}>
          Loading orders…
        </Text>
      </DemoScreen>
    );
  }

  if (groupsQuery.isError) {
    return (
      <DemoScreen title="Orders">
        <EmptyStateCard
          title="Could not load orders"
          message={ERROR_MESSAGES.vendorOrderGroupsFailed}
        />
      </DemoScreen>
    );
  }

  const groups = groupsQuery.data ?? [];
  if (groups.length === 0) {
    return (
      <DemoScreen title="Orders" subtitle="Incoming requests from customers on your shop">
        <EmptyStateCard title="No orders yet" message={EMPTY_STATE_MESSAGES.ordersVendorEmpty} />
      </DemoScreen>
    );
  }

  return (
    <DemoScreen title="Orders" subtitle="Incoming requests from customers on your shop">
      {groups.map((group) => (
        <VendorGroupListRow key={group.id} group={group} onPress={handlePress} />
      ))}
    </DemoScreen>
  );
}
