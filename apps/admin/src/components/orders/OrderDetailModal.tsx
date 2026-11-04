import type { OrderVendorGroupStatus } from '@golden-abode/types';
import { ORDER_STATUSES } from '@golden-abode/types';
import { useRef, useState } from 'react';

import {
  ORDER_STATUS_LABELS,
  REFUND_MIN_AMOUNT_PAISE,
  REFUND_REASON_MAX_LENGTH,
  REFUND_REASON_MIN_LENGTH,
  REFUND_STATUS_LABELS,
  VENDOR_GROUP_STATUS_LABELS,
  VENDOR_GROUP_STATUS_OPTIONS,
} from '@/constants/order.constants';
import { ERROR_MESSAGES } from '@/constants/error.constants';
import { useOrderRefundsQuery, usePaymentEventsQuery } from '@/queries/useOrdersQueries';
import styles from '@/styles/shared.module.css';
import type {
  OrderDetailModalProps,
  PaymentEventsListProps,
  RefundFormProps,
  RefundHistoryProps,
  VendorGroupBlockProps,
} from '@/types/orders.types';
import { formatDateTime } from '@/utils/date';
import { formatPaise, rupeesToPaise } from '@/utils/money';

export function OrderDetailModal({
  order,
  isSubmitting,
  actionError,
  refundNotice,
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
  const refundsQuery = useOrderRefundsQuery(
    order.id,
    order.status !== ORDER_STATUSES.PENDING_PAYMENT,
  );
  const refunds = refundsQuery.data ?? [];
  const canRefund =
    order.status === ORDER_STATUSES.CONFIRMED || order.status === ORDER_STATUSES.REFUND_REQUIRED;
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

          {canRefund ? (
            <RefundForm
              key={order.updatedAt}
              order={order}
              refunds={refunds}
              historyStatus={
                refundsQuery.isSuccess ? 'loaded' : refundsQuery.isError ? 'failed' : 'loading'
              }
              isSubmitting={isSubmitting}
              onRefund={onRefund}
            />
          ) : null}
          {refundNotice ? (
            <p className={refundNotice.tone === 'error' ? styles.error : styles.hint}>
              {refundNotice.text}
            </p>
          ) : null}
          <RefundHistory refunds={refunds} />

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
        </div>
      </div>
    </div>
  );
}

function RefundForm({ order, refunds, historyStatus, isSubmitting, onRefund }: RefundFormProps) {
  const [amountInput, setAmountInput] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  // Two clicks can land before the button re-renders as disabled; a refund
  // submitted twice would be a second refund.
  const inFlightRef = useRef(false);
  const isLocked = order.status === ORDER_STATUSES.REFUND_REQUIRED;
  // The refundable amount is the captured total less the refund history, so
  // the form is unusable until that history is known (decision 0054 rule 5).
  const isHistoryLoaded = historyStatus === 'loaded';

  const takenPaise = refunds
    .filter((refund) => refund.status !== 'failed')
    .reduce((sum, refund) => sum + refund.amountPaise, 0);
  const remainingPaise = (order.capturedPaise ?? rupeesToPaise(order.grandTotal)) - takenPaise;
  const amountValue =
    isLocked || amountInput === null ? (remainingPaise / 100).toFixed(2) : amountInput;

  const amountPaise = rupeesToPaise(Number(amountValue));
  const isAmountValid =
    isLocked ||
    (Number.isFinite(amountPaise) &&
      amountPaise >= REFUND_MIN_AMOUNT_PAISE &&
      amountPaise <= remainingPaise);
  const trimmedReason = reason.trim();
  const canSubmit =
    isHistoryLoaded &&
    !isSubmitting &&
    isAmountValid &&
    trimmedReason.length >= REFUND_REASON_MIN_LENGTH;

  const handleSubmit = async (): Promise<void> => {
    if (inFlightRef.current) {
      return;
    }
    inFlightRef.current = true;
    try {
      // A refund_required order must be refunded in full (decision 0054), so
      // the server picks the amount; one is sent only for a deliberate
      // partial refund.
      const outcome = await onRefund(order.id, {
        reason: trimmedReason,
        ...(isLocked ? {} : { amountPaise }),
      });
      if (outcome !== 'failed') {
        // Back to the default, which follows the refetched history.
        setAmountInput(null);
        setReason('');
      }
    } finally {
      inFlightRef.current = false;
    }
  };

  return (
    <>
      <h3 className={styles.modalTitle}>Refund</h3>
      <label className={styles.label} htmlFor="refund-amount">
        Refund amount (₹)
      </label>
      <input
        id="refund-amount"
        className={styles.input}
        type="number"
        min={REFUND_MIN_AMOUNT_PAISE / 100}
        max={remainingPaise / 100}
        step="0.01"
        disabled={isLocked || !isHistoryLoaded}
        value={amountValue}
        onChange={(event) => setAmountInput(event.target.value)}
      />
      <label className={styles.label} htmlFor="refund-reason">
        Refund reason
      </label>
      <textarea
        id="refund-reason"
        className={styles.input}
        placeholder={ERROR_MESSAGES.refundReasonRequired}
        maxLength={REFUND_REASON_MAX_LENGTH}
        disabled={!isHistoryLoaded}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        rows={3}
      />
      <button
        type="button"
        className={`${styles.button} ${styles.buttonPrimary}`}
        disabled={!canSubmit}
        onClick={() => {
          void handleSubmit();
        }}
      >
        Refund
      </button>
      {historyStatus === 'failed' ? (
        <p className={styles.error}>{ERROR_MESSAGES.refundHistoryLoadFailed}</p>
      ) : null}
    </>
  );
}

function RefundHistory({ refunds }: RefundHistoryProps) {
  if (refunds.length === 0) {
    return null;
  }
  const newestFirst = [...refunds].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <>
      <h3 className={styles.modalTitle}>Refund history</h3>
      <ul className={styles.refundList}>
        {newestFirst.map((refund) => (
          <li key={refund.id}>
            <p className={styles.name}>
              {formatPaise(refund.amountPaise)} · {REFUND_STATUS_LABELS[refund.status]}
            </p>
            <p className={styles.meta}>
              {formatDateTime(refund.createdAt)} · {refund.reason}
            </p>
          </li>
        ))}
      </ul>
    </>
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
