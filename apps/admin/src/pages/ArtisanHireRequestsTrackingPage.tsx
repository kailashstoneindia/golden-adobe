import { useState } from 'react';
import type { AdminHireRequestDto } from '@golden-abode/types';
import { isEmpty } from 'lodash';

import { APP_CONSTANTS } from '@/constants/appConstants';
import { ContactBlock, ContactCell, Row } from '@/components/common/ContactBlock';
import { ERROR_MESSAGES } from '@/constants/error.constants';
import { useAllHireRequestsQuery, useCancelHireRequestMutation } from '@/queries';
import { HIRE_REQUEST_STATUS_LABELS, labelFor, TRADE_TYPE_LABELS } from '@/constants/labels';
import styles from '@/styles/shared.module.css';
import { formatDateTime } from '@/utils/date';

// Terminal states mirror the backend's own claimTransition guard
// (hire-requests.service.ts): cancel is only legal from
// PENDING_ADMIN_REVIEW, PENDING_ARTISAN_RESPONSE, ACCEPTED_BY_ARTISAN, or
// IN_PROGRESS (decision 0055 added the waiting-on-artisan status).
const CANCELLABLE_STATUSES = new Set([
  'PENDING_ADMIN_REVIEW',
  'PENDING_ARTISAN_RESPONSE',
  'ACCEPTED_BY_ARTISAN',
  'IN_PROGRESS',
]);

export function ArtisanHireRequestsTrackingPage() {
  const [selectedRequest, setSelectedRequest] = useState<AdminHireRequestDto | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const requestsQuery = useAllHireRequestsQuery({
    page: 1,
    limit: APP_CONSTANTS.defaultPageSize,
  });
  const cancelMutation = useCancelHireRequestMutation();

  const requests = requestsQuery.data?.items ?? [];

  // Why the server refused a cancel (e.g. the customer cancelled a moment
  // earlier). Shown in the popup, which stays open with the reason kept.
  const [cancelError, setCancelError] = useState<string | null>(null);

  const handleClose = () => {
    setSelectedRequest(null);
    setCancelReason('');
    setCancelError(null);
  };

  const handleCancel = async (requestId: string) => {
    setCancelError(null);
    try {
      await cancelMutation.mutateAsync({ requestId, body: { reason: cancelReason } });
      handleClose();
    } catch (error) {
      setCancelError(error instanceof Error ? error.message : 'Request failed');
    }
  };

  if (requestsQuery.isLoading) {
    return <p className={styles.pageSubtitle}>Loading hire requests…</p>;
  }

  if (requestsQuery.isError) {
    return <p className={styles.error}>{ERROR_MESSAGES.loadUsersFailed}</p>;
  }

  return (
    <section>
      <h2 className={styles.pageTitle}>All hire requests</h2>
      <p className={styles.pageSubtitle}>
        Every hire request regardless of status — for the pending review queue, use Hire requests
        instead.
      </p>

      {isEmpty(requests) ? (
        <div className={styles.empty}>No hire requests yet.</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Ustaad</th>
                <th>Address</th>
                <th>Status</th>
                <th>Requested</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr
                  key={request.id}
                  className={styles.clickableRow}
                  onClick={() => setSelectedRequest(request)}
                >
                  <ContactCell contact={request.customer} />
                  <ContactCell contact={request.artisan} />
                  <td>{request.addressText}</td>
                  <td>{labelFor(HIRE_REQUEST_STATUS_LABELS, request.status)}</td>
                  <td>{formatDateTime(request.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedRequest ? (
        <div className={styles.overlay} onClick={handleClose} role="presentation">
          <div className={styles.modal} onClick={(event) => event.stopPropagation()} role="dialog">
            <h2 className={styles.modalTitle}>
              {labelFor(HIRE_REQUEST_STATUS_LABELS, selectedRequest.status)}
            </h2>
            <p className={styles.pageSubtitle}>{selectedRequest.addressText}</p>

            <div className={styles.modalBody}>
              <ContactBlock title="Customer" contact={selectedRequest.customer} />
              <ContactBlock title="Ustaad" contact={selectedRequest.artisan}>
                <Row label="Trade">
                  {labelFor(TRADE_TYPE_LABELS, selectedRequest.artisanTradeType)}
                </Row>
              </ContactBlock>
              <DetailRow label="Notes" value={selectedRequest.notes || '—'} />
              <DetailRow label="Requested" value={formatDateTime(selectedRequest.createdAt)} />
              <DetailRow label="Reviewed by" value={selectedRequest.adminReviewerName ?? '—'} />
              {selectedRequest.adminRejectReason ? (
                <DetailRow label="Reject reason" value={selectedRequest.adminRejectReason} />
              ) : null}
              <DetailRow
                label="Estimates"
                value={
                  selectedRequest.latestEstimate
                    ? `${selectedRequest.estimateCount} (latest: ${selectedRequest.latestEstimate.estimatedDays} days)`
                    : String(selectedRequest.estimateCount)
                }
              />
              <DetailRow
                label="Admin reviewed"
                value={
                  selectedRequest.adminReviewedAt
                    ? formatDateTime(selectedRequest.adminReviewedAt)
                    : '—'
                }
              />
              {selectedRequest.artisanResponseDueAt ? (
                <DetailRow
                  label="Artisan must respond by"
                  value={formatDateTime(selectedRequest.artisanResponseDueAt)}
                />
              ) : null}
              <DetailRow
                label="Artisan responded"
                value={
                  selectedRequest.artisanRespondedAt
                    ? formatDateTime(selectedRequest.artisanRespondedAt)
                    : '—'
                }
              />
              {selectedRequest.artisanDeclineReason ? (
                <DetailRow label="Decline reason" value={selectedRequest.artisanDeclineReason} />
              ) : null}
              <DetailRow
                label="Started"
                value={selectedRequest.startedAt ? formatDateTime(selectedRequest.startedAt) : '—'}
              />
              <DetailRow
                label="Completed"
                value={
                  selectedRequest.completedAt ? formatDateTime(selectedRequest.completedAt) : '—'
                }
              />
              <DetailRow
                label="Cancelled"
                value={
                  selectedRequest.cancelledAt ? formatDateTime(selectedRequest.cancelledAt) : '—'
                }
              />
              {selectedRequest.cancelReason ? (
                <DetailRow label="Cancel reason" value={selectedRequest.cancelReason} />
              ) : null}

              {CANCELLABLE_STATUSES.has(selectedRequest.status) ? (
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Cancel reason</span>
                  <input
                    type="text"
                    value={cancelReason}
                    onChange={(event) => setCancelReason(event.target.value)}
                    placeholder="Required to cancel"
                    className={styles.detailValue}
                  />
                </div>
              ) : null}
            </div>

            {cancelError ? (
              <p className={styles.error} role="alert">
                {cancelError}
              </p>
            ) : null}

            <div className={styles.actions}>
              <button
                type="button"
                className={`${styles.button} ${styles.buttonGhost}`}
                onClick={handleClose}
              >
                Close
              </button>
              {CANCELLABLE_STATUSES.has(selectedRequest.status) ? (
                <button
                  type="button"
                  className={`${styles.button} ${styles.buttonDanger}`}
                  disabled={cancelMutation.isPending || !cancelReason.trim()}
                  onClick={() => void handleCancel(selectedRequest.id)}
                >
                  Cancel request
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

type DetailRowProps = {
  label: string;
  value: string;
};

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div className={styles.detailRow}>
      <span className={styles.detailLabel}>{label}</span>
      <span className={styles.detailValue}>{value}</span>
    </div>
  );
}
