import { useState } from 'react';
import type { AdminDriverDto } from '@golden-abode/types';

import { useDriversQuery } from '@/queries';
import { ApiClientError } from '@/services';
import styles from '@/styles/shared.module.css';

export function driverOptionLabel(driver: AdminDriverDto): string {
  const parts = [
    driver.helperName ? `helper ${driver.helperName}` : null,
    driver.vehicle ? driver.vehicle.registrationNumber : null,
  ].filter(Boolean);
  return parts.length > 0 ? `${driver.name} (${parts.join(', ')})` : driver.name;
}

// One shared "pick an active driver" dialog for assign, reassign and re-attempt.
export function DriverPickerModal({
  title,
  confirmLabel,
  excludeDriverId,
  onConfirm,
  onClose,
}: {
  title: string;
  confirmLabel: string;
  /** The driver already on the job, who cannot be picked again. */
  excludeDriverId?: string;
  onConfirm: (driverId: string) => Promise<void>;
  onClose: () => void;
}) {
  const driversQuery = useDriversQuery({ isActive: true, page: 1, limit: 100 });
  const [driverId, setDriverId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const drivers = (driversQuery.data?.items ?? []).filter((d) => d.id !== excludeDriverId);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm(driverId);
      onClose();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Could not complete this');
      setBusy(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div
        className={styles.modal}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <h2 className={styles.modalTitle}>{title}</h2>
        <div className={styles.modalBody}>
          <label className={styles.label} htmlFor="driver-picker">
            Driver
          </label>
          <select
            id="driver-picker"
            className={styles.input}
            value={driverId}
            disabled={busy}
            onChange={(event) => setDriverId(event.target.value)}
          >
            <option value="">Choose a driver…</option>
            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driverOptionLabel(driver)}
              </option>
            ))}
          </select>
          {driversQuery.isError ? <p className={styles.error}>Could not load drivers.</p> : null}
          {error ? <p className={styles.error}>{error}</p> : null}
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonGhost}`}
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonPrimary}`}
            disabled={busy || !driverId}
            onClick={confirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
