import { useMemo, useState } from 'react';
import type { ArtisanHireRequestDto } from '@golden-abode/types';
import { isEmpty } from 'lodash';

import { APP_CONSTANTS } from '@/constants/appConstants';
import { ERROR_MESSAGES } from '@/constants/error.constants';
import { useArtisanPendingHireRequestsQuery, useReviewHireRequestMutation } from '@/queries';
import styles from '@/styles/shared.module.css';
import { formatDateTime } from '@/utils/date';

export function ArtisanHireRequestsPage() {
  const [selectedRequest, setSelectedRequest] = useState<ArtisanHireRequestDto | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const pendingQuery = useArtisanPendingHireRequestsQuery({
    page: 1,
    limit: APP_CONSTANTS.defaultPageSize,
  });
  const reviewMutation = useReviewHireRequestMutation();

  const requests = useMemo(() => pendingQuery.data?.items ?? [], [pendingQuery.data?.items]);

  const handleApprove = async (requestId: string) => {
    await reviewMutation.mutateAsync({ requestId, body: { approve: true } });
    setSelectedRequest(null);
    setRejectReason('');
  };

  const handleReject = async (requestId: string) => {
    await reviewMutation.mutateAsync({
      requestId,
      body: { approve: false, rejectReason },
    });
    setSelectedRequest(null);
    setRejectReason('');
  };

  const handleClose = () => {
    setSelectedRequest(null);
    setRejectReason('');
  };

  if (pendingQuery.isLoading) {
    return <p className={styles.pageSubtitle}>Loading hire-request queue…</p>;
  }

  if (pendingQuery.isError) {
    return <p className={styles.error}>{ERROR_MESSAGES.loadUsersFailed}</p>;
  }

  return (
    <section>
      <h2 className={styles.pageTitle}>Hire requests</h2>
      <p className={styles.pageSubtitle}>
        Every customer hire request lands here first — the artisan is notified only once you approve
        it. Rejecting is terminal; the customer starts a new request instead of resubmitting.
      </p>

      {isEmpty(requests) ? (
        <div className={styles.empty}>No hire requests awaiting review.</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Address</th>
                <th>Notes</th>
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
                  <td>{request.notes || '-'}</td>
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
            <h2 className={styles.modalTitle}>Review hire request</h2>
            <p className={styles.pageSubtitle}>{selectedRequest.addressText}</p>

            <div className={styles.modalBody}>
              <DetailRow label="Notes" value={selectedRequest.notes || '-'} />
              <DetailRow label="Requested" value={formatDateTime(selectedRequest.createdAt)} />
              {selectedRequest.artisanActiveJobCount != null ? (
                <DetailRow
                  label="Active jobs"
                  value={String(selectedRequest.artisanActiveJobCount)}
                />
              ) : null}
              {selectedRequest.artisanTeamSize != null ? (
                <DetailRow label="Team size" value={String(selectedRequest.artisanTeamSize)} />
              ) : null}
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Rejection reason</span>
                <input
                  type="text"
                  value={rejectReason}
                  onChange={(event) => setRejectReason(event.target.value)}
                  placeholder="Required if rejecting"
                  className={styles.detailValue}
                />
              </div>
            </div>

            <div className={styles.actions}>
              <button
                type="button"
                className={`${styles.button} ${styles.buttonGhost}`}
                onClick={handleClose}
              >
                Close
              </button>
              <button
                type="button"
                className={`${styles.button} ${styles.buttonDanger}`}
                disabled={reviewMutation.isPending || !rejectReason.trim()}
                onClick={() => handleReject(selectedRequest.id)}
              >
                Reject
              </button>
              <button
                type="button"
                className={`${styles.button} ${styles.buttonPrimary}`}
                disabled={reviewMutation.isPending}
                onClick={() => handleApprove(selectedRequest.id)}
              >
                Approve
              </button>
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
