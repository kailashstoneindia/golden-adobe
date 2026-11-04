import { useMemo, useState } from 'react';
import type { ArtisanProfileDto } from '@golden-abode/types';
import { isEmpty } from 'lodash';

import { APP_CONSTANTS } from '@/constants/appConstants';
import { ERROR_MESSAGES } from '@/constants/error.constants';
import {
  useArtisanPendingVerificationQuery,
  useArtisansAwaitingDocumentQuery,
  useRejectArtisanVerificationMutation,
  useVerifyArtisanMutation,
} from '@/queries';
import styles from '@/styles/shared.module.css';
import { formatDateTime } from '@/utils/date';
import { formatPhoneDisplay } from '@/utils/phone';

export function ArtisanVerificationPage() {
  const [selectedArtisan, setSelectedArtisan] = useState<ArtisanProfileDto | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const pendingQuery = useArtisanPendingVerificationQuery({
    page: 1,
    limit: APP_CONSTANTS.defaultPageSize,
  });
  const verifyMutation = useVerifyArtisanMutation();
  const rejectMutation = useRejectArtisanVerificationMutation();

  const artisans = useMemo(() => pendingQuery.data?.items ?? [], [pendingQuery.data?.items]);
  const isSubmitting = verifyMutation.isPending || rejectMutation.isPending;

  const handleVerify = async (artisanId: string) => {
    await verifyMutation.mutateAsync(artisanId);
    setSelectedArtisan(null);
  };

  const handleReject = async (artisanId: string) => {
    const reason = rejectReason.trim();
    await rejectMutation.mutateAsync({ artisanId, body: reason ? { reason } : {} });
    setSelectedArtisan(null);
    setRejectReason('');
  };

  const handleCloseModal = () => {
    setSelectedArtisan(null);
    setRejectReason('');
  };

  if (pendingQuery.isLoading) {
    return <p className={styles.pageSubtitle}>Loading ustaad verification queue…</p>;
  }

  if (pendingQuery.isError) {
    return <p className={styles.error}>{ERROR_MESSAGES.loadUsersFailed}</p>;
  }

  return (
    <section>
      <h2 className={styles.pageTitle}>Ustaad verification</h2>
      <p className={styles.pageSubtitle}>
        Verifying an ustaad also approves their account, and rejecting takes that approval away.
        Only verified ustaads are discoverable to customers.
      </p>

      {isEmpty(artisans) ? (
        <div className={styles.empty}>No ustaads awaiting verification.</div>
      ) : (
        <div className={styles.grid}>
          {artisans.map((artisan) => (
            <button
              key={artisan.id}
              type="button"
              className={styles.card}
              onClick={() => setSelectedArtisan(artisan)}
            >
              <div className={styles.cardTop}>
                <h3 className={styles.name}>{artisan.tradeType}</h3>
                <span className={styles.badge}>Pending</span>
              </div>
              <p className={styles.meta}>
                {artisan.experienceYears != null
                  ? `${artisan.experienceYears} yrs experience`
                  : 'Experience not provided'}
              </p>
              <p className={styles.meta}>Submitted {formatDateTime(artisan.createdAt)}</p>
            </button>
          ))}
        </div>
      )}

      <AwaitingDocumentSection />

      {selectedArtisan ? (
        <ArtisanVerificationModal
          artisan={selectedArtisan}
          isSubmitting={isSubmitting}
          rejectReason={rejectReason}
          onRejectReasonChange={setRejectReason}
          onClose={handleCloseModal}
          onVerify={handleVerify}
          onReject={handleReject}
        />
      ) : null}
    </section>
  );
}

// Decision 0058 §3a: ustaads who can't be verified yet (no profile, or no
// document). Read-only on purpose: there is nothing to approve until the
// document arrives, so the admin's job here is to call them.
function AwaitingDocumentSection() {
  const awaitingQuery = useArtisansAwaitingDocumentQuery({
    page: 1,
    limit: APP_CONSTANTS.defaultPageSize,
  });
  const rows = awaitingQuery.data?.items ?? [];
  const total = awaitingQuery.data?.total ?? 0;

  return (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>Waiting for a document</h3>
      <p className={styles.pageSubtitle}>
        Signed up as an ustaad but can&apos;t be verified yet. Call them to finish onboarding.
      </p>
      {total > rows.length ? (
        <p className={styles.pageSubtitle}>
          Showing {rows.length} of {total}
        </p>
      ) : null}
      {awaitingQuery.isLoading ? (
        <p className={styles.pageSubtitle}>Loading…</p>
      ) : awaitingQuery.isError ? (
        <p className={styles.error}>{ERROR_MESSAGES.loadUsersFailed}</p>
      ) : isEmpty(rows) ? (
        <div className={styles.empty}>Nobody is waiting on a document.</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Profile</th>
                <th>Signed up</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.userId}>
                  <td>{row.name}</td>
                  <td>
                    {row.phone ? (
                      <a href={`tel:${row.phone}`}>{formatPhoneDisplay(row.phone)}</a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>{row.email ? <a href={`mailto:${row.email}`}>{row.email}</a> : '—'}</td>
                  <td>
                    {row.hasProfile
                      ? `${row.tradeType ?? 'Profile'}${row.servicePincode ? ` · ${row.servicePincode}` : ''} · no document`
                      : 'No profile yet'}
                  </td>
                  <td>{formatDateTime(row.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

type ArtisanVerificationModalProps = {
  artisan: ArtisanProfileDto;
  isSubmitting: boolean;
  rejectReason: string;
  onRejectReasonChange: (value: string) => void;
  onClose: () => void;
  onVerify: (artisanId: string) => void;
  onReject: (artisanId: string) => void;
};

function ArtisanVerificationModal({
  artisan,
  isSubmitting,
  rejectReason,
  onRejectReasonChange,
  onClose,
  onVerify,
  onReject,
}: ArtisanVerificationModalProps) {
  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div className={styles.modal} onClick={(event) => event.stopPropagation()} role="dialog">
        <h2 className={styles.modalTitle}>Review verification</h2>
        <p className={styles.pageSubtitle}>{artisan.tradeType}</p>

        <div className={styles.modalBody}>
          <DetailRow label="Trade" value={artisan.tradeType} />
          <DetailRow
            label="Experience"
            value={artisan.experienceYears != null ? `${artisan.experienceYears} years` : '-'}
          />
          <DetailRow label="Service pincode" value={artisan.servicePincode || '-'} />
          <DetailRow label="Bio" value={artisan.bio || '-'} />
          <DetailRow label="Document" value={artisan.documentUrl ? 'Uploaded' : 'Not uploaded'} />
          <DetailRow label="Available" value={artisan.isAvailable ? 'Yes' : 'No'} />
          {artisan.team.length > 0 ? (
            <DetailRow label="Team size" value={String(artisan.team.length)} />
          ) : null}
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Rejection reason</span>
            <input
              type="text"
              value={rejectReason}
              onChange={(event) => onRejectReasonChange(event.target.value)}
              placeholder="Optional, stored in logs only"
              className={styles.detailValue}
            />
          </div>
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonGhost}`}
            onClick={onClose}
          >
            Close
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonDanger}`}
            disabled={isSubmitting}
            onClick={() => onReject(artisan.id)}
          >
            Reject
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonPrimary}`}
            disabled={isSubmitting}
            onClick={() => onVerify(artisan.id)}
          >
            Verify and approve
          </button>
        </div>
      </div>
    </div>
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
