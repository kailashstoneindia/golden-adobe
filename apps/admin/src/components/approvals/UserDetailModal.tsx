import type { UserDto } from '@golden-abode/types';

import styles from '@/styles/shared.module.css';
import { formatRoleLabel } from '@/utils/role';
import { formatPhoneDisplay } from '@/utils/phone';
import { formatDateTime } from '@/utils/date';

type UserDetailModalProps = {
  user: UserDto;
  isSubmitting: boolean;
  showApprovalActions?: boolean;
  onClose: () => void;
  onApprove?: (userId: string) => void;
  onReject?: (userId: string) => void;
};

export function UserDetailModal({
  user,
  isSubmitting,
  showApprovalActions = true,
  onClose,
  onApprove,
  onReject,
}: UserDetailModalProps) {
  const handleApprove = () => onApprove?.(user.id);
  const handleReject = () => onReject?.(user.id);

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div className={styles.modal} onClick={(event) => event.stopPropagation()} role="dialog">
        <h2 className={styles.modalTitle}>Review request</h2>
        <p className={styles.pageSubtitle}>{user.name}</p>

        <div className={styles.modalBody}>
          <DetailRow label="Role" value={formatRoleLabel(user.role)} />
          <DetailRow label="Phone" value={formatPhoneDisplay(user.phone)} />
          <DetailRow label="Status" value={user.isApproved ? 'Approved' : 'Pending approval'} />
          <DetailRow label="Active" value={user.isActive ? 'Yes' : 'No'} />
          <DetailRow label="Joined" value={formatDateTime(user.createdAt)} />
        </div>

        <div className={styles.actions}>
          <button type="button" className={`${styles.button} ${styles.buttonGhost}`} onClick={onClose}>
            Close
          </button>
          {showApprovalActions ? (
            <>
              <button
                type="button"
                className={`${styles.button} ${styles.buttonDanger}`}
                disabled={isSubmitting}
                onClick={handleReject}
              >
                Reject
              </button>
              <button
                type="button"
                className={`${styles.button} ${styles.buttonPrimary}`}
                disabled={isSubmitting}
                onClick={handleApprove}
              >
                Approve
              </button>
            </>
          ) : null}
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
      <span>{value}</span>
    </div>
  );
}
