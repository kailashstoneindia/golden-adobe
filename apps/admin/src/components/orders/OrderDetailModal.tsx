import type { OrderVendorGroupStatus } from '@golden-abode/types';
import { ORDER_STATUSES } from '@golden-abode/types';
import { useState } from 'react';

import {
  ORDER_STATUS_LABELS,
  VENDOR_GROUP_STATUS_LABELS,
  VENDOR_GROUP_STATUS_OPTIONS,
} from '@/constants/order.constants';
import { ERROR_MESSAGES } from '@/constants/error.constants';
import { usePaymentEventsQuery } from '@/queries/useOrdersQueries';
import styles from '@/styles/shared.module.css';
import type {
  OrderDetailModalProps,
  PaymentEventsListProps,
  VendorGroupBlockProps,
} from '@/types/orders.types';
import { formatDateTime } from '@/utils/date';

export function OrderDetailModal({
  order,
  isSubmitting,
  actionError,
  onClose,
  onRefund,
  onCancel,
  onOverrideStatus,
}: OrderDetailModalProps) {
  const [isEventsOpen, setIsEventsOpen] = useState(false);
  const [overrideGroupId, setOverrideGroupId] = useState(order.vendorGroups[0]?.id ?? '');
  const [overrideStatus, setOverrideStatus] = useState(VENDOR_GROUP_STATUS_OPTIONS[0]);
  const [overrideReason, setOverrideReason] = useState('');
  const eventsQuery = usePaymentEventsQuery(order.id, isEventsOpen);
  const canRefund = order.status === ORDER_STATUSES.CONFIRMED;
  const canCancel =
    order.status === ORDER_STATUSES.PENDING_PAYMENT || order.status === ORDER_STATUSES.REFUNDED;

  const handleOverride = async (): Promise<void> => {
    if (!overrideGroupId || overrideReason.trim().length === 0) {
      return;
    }
    await onOverrideStatus({
      groupId: overrideGroupId,
      status: overrideStatus,
      reason: overrideReason.trim(),
    });
  };

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div className={styles.modal} onClick={(event) => event.stopPropagation()} role="dialog">
        <h2 className={styles.modalTitle}>Order {order.id.slice(0, 8)}</h2>
        <p className={styles.pageSubtitle}>
          {ORDER_STATUS_LABELS[order.status]} · ₹{order.grandTotal}
        </p>
        {order.deliveryAddress ? (
          <p className={styles.pageSubtitle}>
            {order.deliveryAddress.label}: {order.deliveryAddress.addressLine1},{' '}
            {order.deliveryAddress.city} {order.deliveryAddress.pincode}
          </p>
        ) : null}

        <div className={styles.modalBody}>
          {order.vendorGroups.map((group) => (
            <VendorGroupBlock key={group.id} group={group} />
          ))}

          <h3 className={styles.modalTitle}>Override group status</h3>
          <label className={styles.pageSubtitle} htmlFor="override-group">
            Vendor group
          </label>
          <select
            id="override-group"
            className={styles.input}
            value={overrideGroupId}
            onChange={(event) => setOverrideGroupId(event.target.value)}
          >
            {order.vendorGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.shopName} ({VENDOR_GROUP_STATUS_LABELS[group.status]})
              </option>
            ))}
          </select>
          <select
            className={styles.input}
            value={overrideStatus}
            onChange={(event) => {
              const nextStatus = parseVendorGroupStatus(event.target.value);
              if (nextStatus) {
                setOverrideStatus(nextStatus);
              }
            }}
          >
            {VENDOR_GROUP_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {VENDOR_GROUP_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
          <textarea
            className={styles.input}
            placeholder={ERROR_MESSAGES.overrideReasonRequired}
            value={overrideReason}
            onChange={(event) => setOverrideReason(event.target.value)}
            rows={3}
          />
          <button
            type="button"
            className={`${styles.button} ${styles.buttonGhost}`}
            disabled={isSubmitting || overrideReason.trim().length === 0}
            onClick={() => {
              void handleOverride();
            }}
          >
            Override status
          </button>

          <button
            type="button"
            className={`${styles.button} ${styles.buttonGhost}`}
            onClick={() => setIsEventsOpen((current) => !current)}
          >
            {isEventsOpen ? 'Hide payment events' : 'Show payment events'}
          </button>
          {isEventsOpen ? <PaymentEventsList events={eventsQuery.data ?? []} /> : null}
          {actionError ? <p className={styles.error}>{actionError}</p> : null}
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonGhost}`}
            onClick={onClose}
          >
            Close
          </button>
          {canCancel ? (
            <button
              type="button"
              className={`${styles.button} ${styles.buttonDanger}`}
              disabled={isSubmitting}
              onClick={() => {
                void onCancel(order.id);
              }}
            >
              Cancel
            </button>
          ) : null}
          {canRefund ? (
            <button
              type="button"
              className={`${styles.button} ${styles.buttonPrimary}`}
              disabled={isSubmitting}
              onClick={() => {
                void onRefund(order.id);
              }}
            >
              Refund
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function VendorGroupBlock({ group }: VendorGroupBlockProps) {
  return (
    <div className={styles.statCard}>
      <p className={styles.name}>
        {group.shopName} · {VENDOR_GROUP_STATUS_LABELS[group.status]}
      </p>
      <p className={styles.meta}>
        Subtotal ₹{group.subtotal} · Loading ₹{group.loadingUnloadingFee}
      </p>
      {group.items.map((item) => (
        <p key={item.id} className={styles.meta}>
          {item.productName} ({item.productCode}) × {item.quantity} @ ₹{item.unitPriceSnapshot}
        </p>
      ))}
    </div>
  );
}

function PaymentEventsList({ events }: PaymentEventsListProps) {
  if (events.length === 0) {
    return <p className={styles.meta}>No payment events yet.</p>;
  }
  return (
    <div>
      {events.map((event) => (
        <p key={event.id} className={styles.meta}>
          {formatDateTime(event.createdAt)} · {event.eventType}
        </p>
      ))}
    </div>
  );
}

function parseVendorGroupStatus(value: string): OrderVendorGroupStatus | null {
  const match = VENDOR_GROUP_STATUS_OPTIONS.find((status) => status === value);
  return match ?? null;
}
