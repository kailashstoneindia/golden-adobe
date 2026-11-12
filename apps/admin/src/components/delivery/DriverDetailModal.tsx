import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AdminDriverDto, VehicleDto } from '@golden-abode/types';

import { FormField } from '@/components/common/FormField';
import {
  deliveryKeys,
  useConfirmDriverDocumentMutation,
  useDriverQuery,
  useSetUserActiveMutation,
  useUpdateDriverMutation,
  useVehiclesQuery,
} from '@/queries';
import { ApiClientError, deliveryService } from '@/services';
import { uploadToS3 } from '@/services/api/mediaService';
import styles from '@/styles/shared.module.css';
import type { DriverDocumentKind, UpdateDriverRequest } from '@/types/delivery.types';

import { HELPER_ERROR, INDIAN_MOBILE, PHONE_ERROR } from './DriverFormModal';

const messageOf = (error: unknown, fallback: string) =>
  error instanceof ApiClientError || error instanceof Error ? error.message : fallback;

type Draft = {
  name: string;
  phone: string;
  licenceNumber: string;
  helperName: string;
  helperPhone: string;
  vehicleId: string;
};

const toDraft = (driver: AdminDriverDto): Draft => ({
  name: driver.name,
  phone: driver.phone,
  licenceNumber: driver.licenceNumber,
  helperName: driver.helperName ?? '',
  helperPhone: driver.helperPhone ?? '',
  vehicleId: driver.vehicle?.id ?? '',
});

// Only the fields the admin changed, so a save never rewrites untouched data.
function changesFrom(driver: AdminDriverDto, draft: Draft): UpdateDriverRequest {
  const original = toDraft(driver);
  const changes: UpdateDriverRequest = {};
  if (draft.name.trim() !== original.name) changes.name = draft.name.trim();
  if (draft.phone.trim() !== original.phone) changes.phone = draft.phone.trim();
  if (draft.licenceNumber.trim() !== original.licenceNumber) {
    changes.licenceNumber = draft.licenceNumber.trim();
  }
  if (
    draft.helperName.trim() !== original.helperName ||
    draft.helperPhone.trim() !== original.helperPhone
  ) {
    changes.helperName = draft.helperName.trim() || null;
    changes.helperPhone = draft.helperPhone.trim() || null;
  }
  if (draft.vehicleId !== original.vehicleId) changes.vehicleId = draft.vehicleId || null;
  return changes;
}

function validate(draft: Draft): string | null {
  if (!draft.name.trim()) return 'Name is required';
  if (!INDIAN_MOBILE.test(draft.phone.trim())) return PHONE_ERROR;
  if (!draft.licenceNumber.trim()) return 'Licence number is required';
  const helperName = draft.helperName.trim();
  const helperPhone = draft.helperPhone.trim();
  if (Boolean(helperName) !== Boolean(helperPhone)) return HELPER_ERROR;
  if (helperPhone && !INDIAN_MOBILE.test(helperPhone)) return PHONE_ERROR;
  return null;
}

function DocumentRow({
  driverId,
  kind,
  label,
  viewUrl,
}: {
  driverId: string;
  kind: DriverDocumentKind;
  label: string;
  viewUrl: string | null;
}) {
  const confirm = useConfirmDriverDocumentMutation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ticket from the API, file straight to S3, then tell the API it is there.
  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const ticket = await deliveryService.drivers.createDocumentUploadUrl(
        driverId,
        kind,
        file.type,
      );
      await uploadToS3(ticket, file);
      await confirm.mutateAsync({ id: driverId, kind, key: ticket.key });
    } catch (caught) {
      setError(messageOf(caught, 'Could not upload the document'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.detailRow}>
      <span className={styles.detailLabel}>{label.charAt(0).toUpperCase() + label.slice(1)}</span>
      <span className={styles.detailValue}>
        {viewUrl ? (
          <a href={viewUrl} target="_blank" rel="noreferrer">
            View {label}
          </a>
        ) : (
          'Not uploaded'
        )}{' '}
        <label className={styles.label}>
          Upload {label}
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
              event.target.value = '';
            }}
          />
        </label>
        {busy ? <span className={styles.meta}> Uploading…</span> : null}
        {error ? <p className={styles.error}>{error}</p> : null}
      </span>
    </div>
  );
}

function DriverDetailBody({
  driver,
  vehicles,
  onClose,
}: {
  driver: AdminDriverDto;
  vehicles: VehicleDto[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const update = useUpdateDriverMutation();
  const setActive = useSetUserActiveMutation();
  const [draft, setDraft] = useState<Draft>(() => toDraft(driver));
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof Draft) => (value: string) =>
    setDraft((previous) => ({ ...previous, [key]: value }));

  const changes = changesFrom(driver, draft);
  const busy = update.isPending || setActive.isPending;

  // The current vehicle stays in the list even if it was deactivated since.
  const choices = vehicles.filter((v) => v.isActive || v.id === driver.vehicle?.id);

  const save = async () => {
    const problem = validate(draft);
    setError(problem);
    if (problem) return;
    try {
      await update.mutateAsync({ id: driver.id, body: changes });
    } catch (caught) {
      setError(messageOf(caught, 'Could not save the driver'));
    }
  };

  const toggleActive = async (isActive: boolean) => {
    setError(null);
    try {
      await setActive.mutateAsync({ userId: driver.userId, isActive });
      await queryClient.invalidateQueries({ queryKey: deliveryKeys.all });
    } catch (caught) {
      setError(messageOf(caught, 'Could not change the active state'));
    }
  };

  return (
    <>
      <div className={styles.modalBody}>
        <FormField
          id="edit-driver-name"
          label="Name"
          value={draft.name}
          onChange={set('name')}
          disabled={busy}
          maxLength={128}
        />
        <FormField
          id="edit-driver-phone"
          label="Phone"
          value={draft.phone}
          onChange={set('phone')}
          disabled={busy}
          maxLength={13}
        />
        <FormField
          id="edit-driver-licence"
          label="Licence number"
          value={draft.licenceNumber}
          onChange={set('licenceNumber')}
          disabled={busy}
          maxLength={32}
        />
        <FormField
          id="edit-driver-helper-name"
          label="Helper name"
          value={draft.helperName}
          onChange={set('helperName')}
          disabled={busy}
          maxLength={128}
        />
        <FormField
          id="edit-driver-helper-phone"
          label="Helper phone"
          value={draft.helperPhone}
          onChange={set('helperPhone')}
          disabled={busy}
          maxLength={13}
        />
        <div>
          <label className={styles.label} htmlFor="edit-driver-vehicle">
            Vehicle
          </label>
          <select
            id="edit-driver-vehicle"
            className={styles.input}
            value={draft.vehicleId}
            disabled={busy}
            onChange={(event) => set('vehicleId')(event.target.value)}
          >
            <option value="">None</option>
            {choices.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.registrationNumber} ({vehicle.type})
              </option>
            ))}
          </select>
        </div>
        {error ? <p className={styles.error}>{error}</p> : null}

        <h3 className={styles.sectionTitle}>Documents</h3>
        <DocumentRow
          driverId={driver.id}
          kind="licence"
          label="licence"
          viewUrl={driver.licenceDocViewUrl}
        />
        <DocumentRow
          driverId={driver.id}
          kind="aadhaar"
          label="Aadhaar"
          viewUrl={driver.aadhaarDocViewUrl}
        />

        <h3 className={styles.sectionTitle}>Account</h3>
        <label className={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={driver.isActive}
            disabled={busy}
            onChange={(event) => void toggleActive(event.target.checked)}
          />
          Active
        </label>
        <p className={styles.meta}>
          An inactive driver cannot log in. Jobs already assigned to them stay as they are.
        </p>
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
          className={`${styles.button} ${styles.buttonPrimary}`}
          disabled={busy || Object.keys(changes).length === 0}
          onClick={save}
        >
          Save changes
        </button>
      </div>
    </>
  );
}

export function DriverDetailModal({
  driverId,
  onClose,
}: {
  driverId: string;
  onClose: () => void;
}) {
  const driverQuery = useDriverQuery(driverId);
  const vehiclesQuery = useVehiclesQuery();
  const driver = driverQuery.data;

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div
        className={styles.modal}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label={driver ? `Driver ${driver.name}` : 'Driver'}
      >
        <h2 className={styles.modalTitle}>{driver?.name ?? 'Driver'}</h2>
        {driverQuery.isLoading ? (
          <p className={styles.pageSubtitle}>Loading driver…</p>
        ) : driver ? (
          <DriverDetailBody
            key={driver.id}
            driver={driver}
            vehicles={vehiclesQuery.data ?? []}
            onClose={onClose}
          />
        ) : (
          <p className={styles.error}>Could not load this driver.</p>
        )}
      </div>
    </div>
  );
}
