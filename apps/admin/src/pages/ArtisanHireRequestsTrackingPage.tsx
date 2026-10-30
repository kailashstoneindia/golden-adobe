import { useState } from 'react';
import type { ArtisanHireRequestDto } from '@golden-abode/types';
import { isEmpty } from 'lodash';

import { APP_CONSTANTS } from '@/constants/appConstants';
import { ERROR_MESSAGES } from '@/constants/error.constants';
import { useAllHireRequestsQuery, useCancelHireRequestMutation } from '@/queries';
import styles from '@/styles/shared.module.css';
import { formatDateTime } from '@/utils/date';

// Terminal states mirror the backend's own claimTransition guard
// (hire-requests.service.ts): cancel is only legal from
// PENDING_ADMIN_REVIEW, ACCEPTED_BY_ARTISAN, or IN_PROGRESS.
const CANCELLABLE_STATUSES = new Set([
  'PENDING_ADMIN_REVIEW',
  'ACCEPTED_BY_ARTISAN',
  'IN_PROGRESS',
]);

export function ArtisanHireRequestsTrackingPage() {
  const [selectedRequest, setSelectedRequest] = useState<ArtisanHireRequestDto | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const requestsQuery = useAllHireRequestsQuery({
    page: 1,
    limit: APP_CONSTANTS.defaultPageSize,
  });
  const cancelMutation = useCancelHireRequestMutation();

  const requests = requestsQuery.data?.items ?? [];

  const handleClose = () => {
    setSelectedRequest(null);
    setCancelReason('');
  };

  const handleCancel = async (requestId: string) => {
    await cancelMutation.mutateAsync({ requestId, body: { reason: cancelReason } });
    handleClose();
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
                  <td>{request.addressText}</td>
                  <td>{request.status}</td>
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
            <h2 className={styles.modalTitle}>{selectedRequest.status}</h2>
            <p className={styles.pageSubtitle}>{selectedRequest.addressText}</p>

            <div className={styles.modalBody}>
              <DetailRow label="Notes" value={selectedRequest.notes || '—'} />
              <DetailRow label="Requested" value={formatDateTime(selectedRequest.createdAt)} />
              <DetailRow
                label="Admin reviewed"
                value={
                  selectedRequest.adminReviewedAt
                    ? formatDateTime(selectedRequest.adminReviewedAt)
                    : '—'
                }
              />
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
