import { useState } from 'react';
import { isEmpty } from 'lodash';

import { FormField } from '@/components/common/FormField';
import { useCreateVehicleMutation, useUpdateVehicleMutation, useVehiclesQuery } from '@/queries';
import { ApiClientError } from '@/services';
import styles from '@/styles/shared.module.css';

function VehicleFormModal({ onClose }: { onClose: () => void }) {
  const create = useCreateVehicleMutation();
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [type, setType] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<{ registrationNumber?: string; type?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const submit = async () => {
    const found: typeof errors = {};
    if (!registrationNumber.trim()) found.registrationNumber = 'Registration number is required';
    if (!type.trim()) found.type = 'Type is required';
    setErrors(found);
    setServerError(null);
    if (Object.keys(found).length > 0) return;

    try {
      await create.mutateAsync({
        registrationNumber: registrationNumber.trim(),
        type: type.trim(),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      onClose();
    } catch (error) {
      setServerError(
        error instanceof ApiClientError ? error.message : 'Could not create the vehicle',
      );
    }
  };

  const busy = create.isPending;
  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div
        className={styles.modal}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label="Add vehicle"
      >
        <h2 className={styles.modalTitle}>Add vehicle</h2>
        <div className={styles.modalBody}>
          <FormField
            id="vehicle-registration"
            label="Registration number"
            value={registrationNumber}
            onChange={setRegistrationNumber}
            disabled={busy}
            maxLength={32}
            autoFocus
          />
          {errors.registrationNumber ? (
            <p className={styles.error}>{errors.registrationNumber}</p>
          ) : null}
          <FormField
            id="vehicle-type"
            label="Type"
            value={type}
            onChange={setType}
            disabled={busy}
            maxLength={64}
          />
          {errors.type ? <p className={styles.error}>{errors.type}</p> : null}
          <FormField
            id="vehicle-notes"
            label="Notes"
            value={notes}
            onChange={setNotes}
            disabled={busy}
            maxLength={255}
          />
          {serverError ? <p className={styles.error}>{serverError}</p> : null}
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
            disabled={busy}
            onClick={submit}
          >
            Create vehicle
          </button>
        </div>
      </div>
    </div>
  );
}

export function VehiclesTab() {
  const [adding, setAdding] = useState(false);
  const vehiclesQuery = useVehiclesQuery();
  const update = useUpdateVehicleMutation();
  const vehicles = vehiclesQuery.data ?? [];

  if (vehiclesQuery.isLoading) {
    return <p className={styles.pageSubtitle}>Loading vehicles…</p>;
  }
  if (vehiclesQuery.isError) {
    return <p className={styles.error}>Could not load vehicles.</p>;
  }

  return (
    <div>
      <div className={styles.actions}>
        <button
          type="button"
          className={`${styles.button} ${styles.buttonPrimary}`}
          onClick={() => setAdding(true)}
        >
          Add vehicle
        </button>
      </div>

      {isEmpty(vehicles) ? (
        <div className={styles.empty}>No vehicles yet.</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Registration</th>
                <th>Type</th>
                <th>Notes</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {vehicles.map((vehicle) => (
                <tr key={vehicle.id}>
                  <td>{vehicle.registrationNumber}</td>
                  <td>{vehicle.type}</td>
                  <td>{vehicle.notes ?? '—'}</td>
                  <td>
                    <span className={styles.badge}>{vehicle.isActive ? 'Active' : 'Inactive'}</span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className={`${styles.button} ${styles.buttonGhost}`}
                      disabled={update.isPending}
                      onClick={() =>
                        update.mutate({ id: vehicle.id, body: { isActive: !vehicle.isActive } })
                      }
                    >
                      {vehicle.isActive ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {update.isError ? <p className={styles.error}>Could not update the vehicle.</p> : null}

      {adding ? <VehicleFormModal onClose={() => setAdding(false)} /> : null}
    </div>
  );
}
