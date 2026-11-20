import { useState } from 'react';
import type { BrandDto } from '@golden-abode/types';

import { FormField } from '@/components/common/FormField';
import { ApiClientError } from '@/services';
import styles from '@/styles/shared.module.css';
import type { BrandFormValues } from '@/types/brands.types';

// Same rules as the backend's CreateBrandDto (decision 0063).
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9 ()-]{7,20}$/;

type Field = keyof BrandFormValues;
type Errors = Partial<Record<Field, string>>;

const FIELDS: { key: Field; label: string; maxLength: number }[] = [
  { key: 'name', label: 'Name', maxLength: 128 },
  { key: 'manufacturerName', label: 'Manufacturer name', maxLength: 255 },
  { key: 'manufacturerAddress', label: 'Manufacturer address', maxLength: 1000 },
  { key: 'consumerCareEmail', label: 'Consumer care email', maxLength: 255 },
  { key: 'consumerCarePhone', label: 'Consumer care phone', maxLength: 20 },
];

function validate(values: BrandFormValues): Errors {
  const errors: Errors = {};
  for (const { key, label } of FIELDS) {
    if (!values[key].trim()) errors[key] = `${label} is required`;
  }
  const email = values.consumerCareEmail.trim();
  if (email && !EMAIL.test(email)) errors.consumerCareEmail = 'Enter a valid email address';
  const phone = values.consumerCarePhone.trim();
  if (phone && !PHONE.test(phone)) {
    errors.consumerCarePhone =
      'Use 7 to 20 digits, spaces, brackets or dashes, optionally starting with +';
  }
  return errors;
}

const toValues = (brand?: BrandDto): BrandFormValues => ({
  name: brand?.name ?? '',
  manufacturerName: brand?.manufacturerName ?? '',
  manufacturerAddress: brand?.manufacturerAddress ?? '',
  consumerCareEmail: brand?.consumerCareEmail ?? '',
  consumerCarePhone: brand?.consumerCarePhone ?? '',
});

// Add (no `brand`) or edit (`brand` given). On edit only the changed fields
// are sent, so a save never rewrites untouched data.
export function BrandFormModal({
  brand,
  busy,
  onSubmit,
  onClose,
}: {
  brand?: BrandDto;
  busy: boolean;
  onSubmit: (body: Partial<BrandFormValues>) => Promise<unknown>;
  onClose: () => void;
}) {
  const title = brand ? 'Edit brand' : 'Add brand';
  const [values, setValues] = useState<BrandFormValues>(() => toValues(brand));
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const set = (key: Field) => (value: string) =>
    setValues((previous) => ({ ...previous, [key]: value }));

  const submit = async () => {
    const found = validate(values);
    setErrors(found);
    setServerError(null);
    if (Object.keys(found).length > 0) return;

    const trimmed = Object.fromEntries(
      FIELDS.map(({ key }) => [key, values[key].trim()]),
    ) as BrandFormValues;
    const original = toValues(brand);
    const body = brand
      ? Object.fromEntries(
          FIELDS.filter(({ key }) => trimmed[key] !== original[key]).map(({ key }) => [
            key,
            trimmed[key],
          ]),
        )
      : trimmed;
    if (brand && Object.keys(body).length === 0) {
      onClose();
      return;
    }

    try {
      await onSubmit(body);
      onClose();
    } catch (error) {
      setServerError(error instanceof ApiClientError ? error.message : 'Could not save the brand');
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
        <p className={styles.pageSubtitle}>
          Shown to customers on every product of this brand, as the law requires.
        </p>
        <div className={styles.modalBody}>
          {FIELDS.map(({ key, label, maxLength }, index) => (
            <div key={key}>
              <FormField
                id={`brand-${key}`}
                label={label}
                value={values[key]}
                onChange={set(key)}
                disabled={busy}
                maxLength={maxLength}
                autoFocus={index === 0}
              />
              {errors[key] ? <p className={styles.error}>{errors[key]}</p> : null}
            </div>
          ))}
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
            Save brand
          </button>
        </div>
      </div>
    </div>
  );
}
