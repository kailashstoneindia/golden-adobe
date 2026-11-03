import type { AdminRefundRequest, OrderDto, OrderVendorGroupStatus } from '@golden-abode/types';
import { ORDER_STATUSES } from '@golden-abode/types';
import { isEmpty } from 'lodash';
import { useState } from 'react';

import { OrderDetailModal } from '@/components/orders/OrderDetailModal';
import { ERROR_MESSAGES } from '@/constants/error.constants';
import {
  ORDER_STATUS_FILTER_OPTIONS,
  ORDER_STATUS_FILTERS,
  ORDER_STATUS_LABELS,
} from '@/constants/order.constants';
import type { OrderStatusFilter } from '@/constants/order.constants';
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
  const [statusFilter, setStatusFilter] = useState<OrderStatusFilter>(ORDER_STATUS_FILTERS.ALL);
  const ordersQuery = useOrdersQuery();
  const refundMutation = useRefundOrderMutation();
  const cancelMutation = useCancelAdminOrderMutation();
  const overrideMutation = useOverrideVendorGroupStatusMutation();
  const isSubmitting =
    refundMutation.isPending || cancelMutation.isPending || overrideMutation.isPending;

  const handleRefund = async (orderId: string, body: AdminRefundRequest): Promise<void> => {
    setActionError(null);
    try {
      const updated = await refundMutation.mutateAsync({ orderId, body });
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

  const orders = filterOrders(ordersQuery.data ?? [], statusFilter);

  return (
    <section>
      <h2 className={styles.pageTitle}>Orders</h2>
      <p className={styles.pageSubtitle}>
        Refund, cancel, and override fulfilment for customer orders.
      </p>

      <label className={styles.label} htmlFor="order-status-filter">
        Status filter
      </label>
      <select
        id="order-status-filter"
        className={styles.input}
        value={statusFilter}
        onChange={(event) => setStatusFilter(parseStatusFilter(event.target.value))}
      >
        {ORDER_STATUS_FILTER_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {isEmpty(orders) ? (
        <div className={styles.empty}>
          {statusFilter === ORDER_STATUS_FILTERS.ALL
            ? 'No orders yet.'
            : 'No orders match this filter.'}
        </div>
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

// "Needs refund" is a work queue, so the longest-waiting order comes first.
function filterOrders(orders: OrderDto[], filter: OrderStatusFilter): OrderDto[] {
  if (filter === ORDER_STATUS_FILTERS.NEEDS_REFUND) {
    return orders
      .filter((order) => order.status === ORDER_STATUSES.REFUND_REQUIRED)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  if (filter === ORDER_STATUS_FILTERS.REFUND_IN_PROGRESS) {
    return orders.filter((order) => order.status === ORDER_STATUSES.REFUND_PENDING);
  }
  return orders;
}

function parseStatusFilter(value: string): OrderStatusFilter {
  const match = ORDER_STATUS_FILTER_OPTIONS.find((option) => option.value === value);
  return match?.value ?? ORDER_STATUS_FILTERS.ALL;
}
