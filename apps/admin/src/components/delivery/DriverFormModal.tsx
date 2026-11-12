import { useState } from 'react';
import type { VehicleDto } from '@golden-abode/types';

import { FormField } from '@/components/common/FormField';
import { ApiClientError } from '@/services';
import styles from '@/styles/shared.module.css';
import type { CreateDriverRequest } from '@/types/delivery.types';

// Same rule as the backend (POST /auth/otp/send): a driver logs in with this number.
export const INDIAN_MOBILE = /^\+91[6-9]\d{9}$/;
export const PHONE_ERROR = 'Phone must be an Indian mobile number like +919876543210';
export const HELPER_ERROR = 'Give the helper name and phone together';

type Errors = Partial<Record<'name' | 'phone' | 'licenceNumber' | 'helper', string>>;

function validate(values: Record<string, string>): Errors {
  const errors: Errors = {};
  if (!values.name.trim()) errors.name = 'Name is required';
  if (!INDIAN_MOBILE.test(values.phone.trim())) errors.phone = PHONE_ERROR;
  if (!values.licenceNumber.trim()) errors.licenceNumber = 'Licence number is required';
  const helperName = values.helperName.trim();
  const helperPhone = values.helperPhone.trim();
  if (Boolean(helperName) !== Boolean(helperPhone)) errors.helper = HELPER_ERROR;
  else if (helperPhone && !INDIAN_MOBILE.test(helperPhone)) errors.helper = PHONE_ERROR;
  return errors;
}

export function DriverFormModal({
  vehicles,
  busy,
  onSubmit,
  onClose,
}: {
  vehicles: VehicleDto[];
  busy: boolean;
  onSubmit: (body: CreateDriverRequest) => Promise<unknown>;
  onClose: () => void;
}) {
  const [values, setValues] = useState({
    name: '',
    phone: '',
    licenceNumber: '',
    helperName: '',
    helperPhone: '',
    vehicleId: '',
  });
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const set = (key: keyof typeof values) => (value: string) =>
    setValues((previous) => ({ ...previous, [key]: value }));

  const submit = async () => {
    const found = validate(values);
    setErrors(found);
    setServerError(null);
    if (Object.keys(found).length > 0) return;

    const body: CreateDriverRequest = {
      name: values.name.trim(),
      phone: values.phone.trim(),
      licenceNumber: values.licenceNumber.trim(),
    };
    if (values.helperName.trim()) {
      body.helperName = values.helperName.trim();
      body.helperPhone = values.helperPhone.trim();
    }
    if (values.vehicleId) body.vehicleId = values.vehicleId;

    try {
      await onSubmit(body);
      onClose();
    } catch (error) {
      setServerError(
        error instanceof ApiClientError ? error.message : 'Could not create the driver',
      );
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div
        className={styles.modal}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label="Add driver"
      >
        <h2 className={styles.modalTitle}>Add driver</h2>
        <p className={styles.pageSubtitle}>
          The driver logs in to the app with this phone number and a one-time code.
        </p>
        <div className={styles.modalBody}>
          <FormField
            id="driver-name"
            label="Name"
            value={values.name}
            onChange={set('name')}
            disabled={busy}
            maxLength={128}
            autoFocus
          />
          {errors.name ? <p className={styles.error}>{errors.name}</p> : null}
          <FormField
            id="driver-phone"
            label="Phone"
            value={values.phone}
            onChange={set('phone')}
            disabled={busy}
            maxLength={13}
          />
          {errors.phone ? <p className={styles.error}>{errors.phone}</p> : null}
          <FormField
            id="driver-licence"
            label="Licence number"
            value={values.licenceNumber}
            onChange={set('licenceNumber')}
            disabled={busy}
            maxLength={32}
          />
          {errors.licenceNumber ? <p className={styles.error}>{errors.licenceNumber}</p> : null}
          <FormField
            id="driver-helper-name"
            label="Helper name"
            value={values.helperName}
            onChange={set('helperName')}
            disabled={busy}
            maxLength={128}
          />
          <FormField
            id="driver-helper-phone"
            label="Helper phone"
            value={values.helperPhone}
            onChange={set('helperPhone')}
            disabled={busy}
            maxLength={13}
          />
          {errors.helper ? <p className={styles.error}>{errors.helper}</p> : null}
          <div>
            <label className={styles.label} htmlFor="driver-vehicle">
              Vehicle
            </label>
            <select
              id="driver-vehicle"
              className={styles.input}
              value={values.vehicleId}
              disabled={busy}
              onChange={(event) => set('vehicleId')(event.target.value)}
            >
              <option value="">None</option>
              {vehicles
                .filter((vehicle) => vehicle.isActive)
                .map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.registrationNumber} ({vehicle.type})
                  </option>
                ))}
            </select>
          </div>
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
            Create driver
          </button>
        </div>
      </div>
    </div>
  );
}
