import { useMemo, useState } from 'react';
import type { ArtisanProfileDto } from '@golden-abode/types';
import { isEmpty } from 'lodash';

import { ERROR_MESSAGES } from '@/constants/error.constants';
import {
  useArtisanPendingVerificationQuery,
  useRejectArtisanVerificationMutation,
  useVerifyArtisanMutation,
} from '@/queries';
import styles from '@/styles/shared.module.css';
import { formatDateTime } from '@/utils/date';

export function ArtisanVerificationPage() {
  const [selectedArtisan, setSelectedArtisan] = useState<ArtisanProfileDto | null>(null);
  const pendingQuery = useArtisanPendingVerificationQuery();
  const verifyMutation = useVerifyArtisanMutation();
  const rejectMutation = useRejectArtisanVerificationMutation();

  const artisans = useMemo(() => pendingQuery.data ?? [], [pendingQuery.data]);
  const isSubmitting = verifyMutation.isPending || rejectMutation.isPending;

  const handleVerify = async (artisanId: string) => {
    await verifyMutation.mutateAsync(artisanId);
    setSelectedArtisan(null);
  };

  const handleReject = async (artisanId: string) => {
    await rejectMutation.mutateAsync({ artisanId, body: {} });
    setSelectedArtisan(null);
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
        Document-backed verification — distinct from the generic account approval. Only verified
        ustaads are discoverable to customers.
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

      {selectedArtisan ? (
        <ArtisanVerificationModal
          artisan={selectedArtisan}
          isSubmitting={isSubmitting}
          onClose={() => setSelectedArtisan(null)}
          onVerify={handleVerify}
          onReject={handleReject}
        />
      ) : null}
    </section>
  );
}

type ArtisanVerificationModalProps = {
  artisan: ArtisanProfileDto;
  isSubmitting: boolean;
  onClose: () => void;
  onVerify: (artisanId: string) => void;
  onReject: (artisanId: string) => void;
};

function ArtisanVerificationModal({
  artisan,
  isSubmitting,
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
            Verify
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
