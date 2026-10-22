import type { OrderDto, OrderVendorGroupStatus } from '@golden-abode/types';
import { isEmpty } from 'lodash';
import { useState } from 'react';

import { OrderDetailModal } from '@/components/orders/OrderDetailModal';
import { ERROR_MESSAGES } from '@/constants/error.constants';
import { ORDER_STATUS_LABELS } from '@/constants/order.constants';
import {
  useCancelAdminOrderMutation,
  useOrdersQuery,
  useOverrideVendorGroupStatusMutation,
  useRefundOrderMutation,
} from '@/queries/useOrdersQueries';
import styles from '@/styles/shared.module.css';
import { formatDateTime } from '@/utils/date';

export function OrdersPage() {
  const [selectedOrder, setSelectedOrder] = useState<OrderDto | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const ordersQuery = useOrdersQuery();
  const refundMutation = useRefundOrderMutation();
  const cancelMutation = useCancelAdminOrderMutation();
  const overrideMutation = useOverrideVendorGroupStatusMutation();
  const isSubmitting =
    refundMutation.isPending || cancelMutation.isPending || overrideMutation.isPending;

  const handleRefund = async (orderId: string): Promise<void> => {
    setActionError(null);
    try {
      const updated = await refundMutation.mutateAsync(orderId);
      setSelectedOrder(updated);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : ERROR_MESSAGES.refundFailed);
    }
  };

  const handleCancel = async (orderId: string): Promise<void> => {
    setActionError(null);
    try {
      const updated = await cancelMutation.mutateAsync(orderId);
      setSelectedOrder(updated);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : ERROR_MESSAGES.cancelFailed);
    }
  };

  const handleOverrideStatus = async (options: {
    groupId: string;
    status: OrderVendorGroupStatus;
    reason: string;
  }): Promise<void> => {
    if (!selectedOrder) {
      return;
    }
    setActionError(null);
    try {
      await overrideMutation.mutateAsync({
        groupId: options.groupId,
        body: { status: options.status, reason: options.reason },
      });
      const refreshed = await ordersQuery.refetch();
      const nextOrder = refreshed.data?.find((order) => order.id === selectedOrder.id);
      if (nextOrder) {
        setSelectedOrder(nextOrder);
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : ERROR_MESSAGES.overrideStatusFailed);
    }
  };

  if (ordersQuery.isLoading) {
    return <p className={styles.pageSubtitle}>Loading orders…</p>;
  }

  if (ordersQuery.isError) {
    return <p className={styles.error}>{ERROR_MESSAGES.loadOrdersFailed}</p>;
  }

  const orders = ordersQuery.data ?? [];

  return (
    <section>
      <h2 className={styles.pageTitle}>Orders</h2>
      <p className={styles.pageSubtitle}>
        Refund, cancel, and override fulfilment for customer orders.
      </p>

      {isEmpty(orders) ? (
        <div className={styles.empty}>No orders yet.</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Order</th>
                <th>Status</th>
                <th>Total</th>
                <th>Shops</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr
                  key={order.id}
                  className={styles.clickableRow}
                  onClick={() => {
                    setActionError(null);
                    setSelectedOrder(order);
                  }}
                >
                  <td>{order.id.slice(0, 8)}</td>
                  <td>{ORDER_STATUS_LABELS[order.status]}</td>
                  <td>₹{order.grandTotal}</td>
                  <td>{order.vendorGroups.length}</td>
                  <td>{formatDateTime(order.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedOrder ? (
        <OrderDetailModal
          order={selectedOrder}
          isSubmitting={isSubmitting}
          actionError={actionError}
          onClose={() => setSelectedOrder(null)}
          onRefund={handleRefund}
          onCancel={handleCancel}
          onOverrideStatus={handleOverrideStatus}
        />
      ) : null}
    </section>
  );
}
