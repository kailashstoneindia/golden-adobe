import styles from '@/styles/shared.module.css';

// A yes/no question in front of an action that is hard to undo.
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  busy: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className={styles.overlay} onClick={onCancel} role="presentation">
      <div
        className={styles.modal}
        onClick={(event) => event.stopPropagation()}
        role="alertdialog"
        aria-label={title}
      >
        <h2 className={styles.modalTitle}>{title}</h2>
        <p className={styles.pageSubtitle}>{message}</p>
        {error ? <p className={styles.error}>{error}</p> : null}
        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonGhost}`}
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonDanger}`}
            disabled={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
