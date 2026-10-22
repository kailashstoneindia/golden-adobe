import type { OrderVendorGroupStatus } from '@golden-abode/types';
import { ORDER_STATUSES, Role } from '@golden-abode/types';
import { useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';

import { DemoScreen } from '../../../src/components/demo/DemoScreen';
import { OrderVendorSection, VendorStatusActions } from '../../../src/components/orders';
import { Button, EmptyStateCard, Text } from '../../../src/components/ui';
import {
  EMPTY_STATE_MESSAGES,
  ERROR_MESSAGES,
  ORDER_STATUS_LABELS,
  TOAST_MESSAGES,
} from '../../../src/constants';
import { useAuth } from '../../../src/hooks/auth';
import {
  useCancelOrderMutation,
  useOrderQuery,
  useUpdateVendorOrderGroupStatusMutation,
  useVendorOrderGroupQuery,
} from '../../../src/hooks/orders';
import { usePlaceOrder } from '../../../src/hooks/payments';
import { useToast } from '../../../src/hooks/useToast';
import { Colors } from '../../../src/theme';
import type { CustomerOrderDetailProps, VendorOrderDetailProps } from '../../../src/types';
import { formatInr, getApiErrorMessage } from '../../../src/utils';

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const isVendor = user?.role === Role.VENDOR;

  if (!id) {
    return (
      <DemoScreen title="Order details" showBack>
        <EmptyStateCard
          title="Order not available"
          message={EMPTY_STATE_MESSAGES.orderDetailUnavailable}
        />
      </DemoScreen>
    );
  }

  if (isVendor) {
    return <VendorOrderDetail groupId={id} />;
  }

  return <CustomerOrderDetail orderId={id} />;
}

function CustomerOrderDetail({ orderId }: CustomerOrderDetailProps) {
  const orderQuery = useOrderQuery(orderId);
  const cancelOrder = useCancelOrderMutation();
  const { payExistingOrder } = usePlaceOrder();
  const { showSuccess, showError } = useToast();
  const order = orderQuery.data;
  const canCancel = order?.status === ORDER_STATUSES.PENDING_PAYMENT;
  const canPay = canCancel && Boolean(order?.razorpayOrderId);

  const handleCancel = useCallback(() => {
    cancelOrder.mutate(orderId, {
      onSuccess: () => showSuccess(TOAST_MESSAGES.orderCancelled),
      onError: (error) => showError(getApiErrorMessage(error, ERROR_MESSAGES.orderCancelFailed)),
    });
  }, [cancelOrder, orderId, showError, showSuccess]);

  const handlePay = useCallback(() => {
    if (order) {
      void payExistingOrder(order);
    }
  }, [order, payExistingOrder]);

  if (orderQuery.isLoading) {
    return (
      <DemoScreen title="Order details" showBack>
        <Text variant="body" color={Colors.inkSoft}>
          Loading order…
        </Text>
      </DemoScreen>
    );
  }

  if (orderQuery.isError || !order) {
    return (
      <DemoScreen title="Order details" showBack>
        <EmptyStateCard
          title="Order not available"
          message={ERROR_MESSAGES.orderDetailFailed}
        />
      </DemoScreen>
    );
  }

  return (
    <DemoScreen title="Order details" showBack>
      <Text variant="bodyMedium">{ORDER_STATUS_LABELS[order.status]}</Text>
      <Text variant="caption" color={Colors.inkSoft}>
        Total {formatInr(order.grandTotal)}
      </Text>
      {order.deliveryAddress ? (
        <Text variant="caption" color={Colors.inkSoft}>
          {order.deliveryAddress.label}: {order.deliveryAddress.addressLine1},{' '}
          {order.deliveryAddress.city} {order.deliveryAddress.pincode}
        </Text>
      ) : null}
      {order.vendorGroups.map((group) => (
        <OrderVendorSection key={group.id} group={group} />
      ))}
      {canPay ? <Button title="Pay now" onPress={handlePay} /> : null}
      {canCancel ? (
        <Button title="Cancel order" variant="secondary" onPress={handleCancel} />
      ) : null}
      {order.status === ORDER_STATUSES.CONFIRMED ? (
        <Text variant="caption" color={Colors.inkSoft}>
          Need to change this order? Contact support — confirmed orders cannot be cancelled here.
        </Text>
      ) : null}
    </DemoScreen>
  );
}

function VendorOrderDetail({ groupId }: VendorOrderDetailProps) {
  const groupQuery = useVendorOrderGroupQuery(groupId);
  const updateStatus = useUpdateVendorOrderGroupStatusMutation();
  const { showSuccess, showError } = useToast();
  const group = groupQuery.data;

  const handleSelectStatus = useCallback(
    (nextGroupId: string, status: OrderVendorGroupStatus) => {
      updateStatus.mutate(
        { groupId: nextGroupId, status },
        {
          onSuccess: () => showSuccess(TOAST_MESSAGES.vendorGroupStatusUpdated),
          onError: (error) =>
            showError(getApiErrorMessage(error, ERROR_MESSAGES.vendorGroupStatusFailed)),
        },
      );
    },
    [showError, showSuccess, updateStatus],
  );

  if (groupQuery.isLoading) {
    return (
      <DemoScreen title="Order details" showBack>
        <Text variant="body" color={Colors.inkSoft}>
          Loading order…
        </Text>
      </DemoScreen>
    );
  }

  if (groupQuery.isError || !group) {
    return (
      <DemoScreen title="Order details" showBack>
        <EmptyStateCard
          title="Order not available"
          message={ERROR_MESSAGES.orderDetailFailed}
        />
      </DemoScreen>
    );
  }

  return (
    <DemoScreen title="Order details" showBack>
      <OrderVendorSection group={group} />
      <VendorStatusActions
        group={group}
        isUpdating={updateStatus.isPending}
        onSelectStatus={handleSelectStatus}
      />
    </DemoScreen>
  );
}
