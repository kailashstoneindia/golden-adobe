import { useState } from 'react';
import type {
  AdminVendorDto,
  UpdateVendorProfileDto,
  VendorAccountDetailsInputDto,
} from '@golden-abode/types';

import {
  useUpdateVendorBankMutation,
  useUpdateVendorProfileMutation,
} from '@/queries/useVendorsQueries';
import styles from '@/styles/shared.module.css';

type Mode = 'idle' | 'profile' | 'bank';

// Decision 0058 Task 10: fix a vendor's profile and bank details. Each save
// sends only what changed (profile) or the whole record (bank: a half-updated
// account is a failed payout), and the server's refusal is shown in place.
export function VendorEditors({ vendor }: { vendor: AdminVendorDto }) {
  const [mode, setMode] = useState<Mode>('idle');
  return (
    <section role="group" aria-label="Edit vendor" className={styles.contactBlock}>
      <h3 className={styles.sectionTitle}>Edit vendor</h3>
      {mode === 'profile' ? (
        <ProfileForm vendor={vendor} onDone={() => setMode('idle')} />
      ) : mode === 'bank' ? (
        <BankForm vendor={vendor} onDone={() => setMode('idle')} />
      ) : (
        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonGhost}`}
            onClick={() => setMode('profile')}
          >
            Edit profile
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonGhost}`}
            onClick={() => setMode('bank')}
          >
            {vendor.accountDetails ? 'Edit bank details' : 'Add bank details'}
          </button>
        </div>
      )}
    </section>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  disabled,
  type = 'text',
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  type?: 'text' | 'number';
}) {
  return (
    <div>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={styles.input}
        type={type}
        step={type === 'number' ? 'any' : undefined}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function ProfileForm({ vendor, onDone }: { vendor: AdminVendorDto; onDone: () => void }) {
  const mutation = useUpdateVendorProfileMutation();
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    shopName: vendor.shopName,
    address: vendor.address,
    latitude: String(vendor.latitude),
    longitude: String(vendor.longitude),
    gstin: vendor.gstin ?? '',
    upiId: vendor.upiId ?? '',
    minOrderValue: vendor.minOrderValue == null ? '' : String(vendor.minOrderValue),
    hasLoadingUnloadingTeam: vendor.hasLoadingUnloadingTeam ?? false,
  });
  const set = (field: keyof typeof draft) => (value: string) =>
    setDraft({ ...draft, [field]: value });

  // Only what the admin changed goes to the server.
  const changes: UpdateVendorProfileDto = {};
  if (draft.shopName.trim() !== vendor.shopName) changes.shopName = draft.shopName.trim();
  if (draft.address.trim() !== vendor.address) changes.address = draft.address.trim();
  const latitude = Number(draft.latitude);
  const longitude = Number(draft.longitude);
  const pinIsValid = Number.isFinite(latitude) && Number.isFinite(longitude);
  // The pin moves as a pair: if either changed, both go.
  if (pinIsValid && (latitude !== vendor.latitude || longitude !== vendor.longitude)) {
    changes.latitude = latitude;
    changes.longitude = longitude;
  }
  if (draft.gstin.trim().toUpperCase() !== (vendor.gstin ?? '')) {
    changes.gstin = draft.gstin.trim().toUpperCase();
  }
  if (draft.upiId.trim() !== (vendor.upiId ?? '')) changes.upiId = draft.upiId.trim();
  // A minimum cannot be unset from here (enter 0 for none), so blank means unchanged.
  if (draft.minOrderValue !== '' && Number(draft.minOrderValue) !== vendor.minOrderValue) {
    changes.minOrderValue = Number(draft.minOrderValue);
  }
  if (draft.hasLoadingUnloadingTeam !== (vendor.hasLoadingUnloadingTeam ?? false)) {
    changes.hasLoadingUnloadingTeam = draft.hasLoadingUnloadingTeam;
  }
  const canSave =
    Object.keys(changes).length > 0 &&
    draft.shopName.trim() !== '' &&
    draft.address.trim() !== '' &&
    pinIsValid &&
    !mutation.isPending;

  const save = async () => {
    setError(null);
    try {
      await mutation.mutateAsync({ vendorId: vendor.id, body: changes });
      onDone();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Request failed');
    }
  };

  const busy = mutation.isPending;
  return (
    <div>
      <Field
        id="vendor-shop-name"
        label="Shop name"
        value={draft.shopName}
        disabled={busy}
        onChange={set('shopName')}
      />
      <Field
        id="vendor-address"
        label="Address"
        value={draft.address}
        disabled={busy}
        onChange={set('address')}
      />
      <Field
        id="vendor-latitude"
        label="Latitude"
        type="number"
        value={draft.latitude}
        disabled={busy}
        onChange={set('latitude')}
      />
      <Field
        id="vendor-longitude"
        label="Longitude"
        type="number"
        value={draft.longitude}
        disabled={busy}
        onChange={set('longitude')}
      />
      <Field
        id="vendor-gstin"
        label="GSTIN"
        value={draft.gstin}
        disabled={busy}
        onChange={set('gstin')}
      />
      <Field
        id="vendor-upi"
        label="UPI ID"
        value={draft.upiId}
        disabled={busy}
        onChange={set('upiId')}
      />
      <Field
        id="vendor-min-order"
        label="Minimum order (₹)"
        type="number"
        value={draft.minOrderValue}
        disabled={busy}
        onChange={set('minOrderValue')}
      />
      <p className={styles.meta}>Enter 0 for no minimum order.</p>
      <label className={styles.label}>
        <input
          type="checkbox"
          checked={draft.hasLoadingUnloadingTeam}
          disabled={busy}
          onChange={(event) =>
            setDraft({ ...draft, hasLoadingUnloadingTeam: event.target.checked })
          }
        />{' '}
        Has a loading team
      </label>
      <p className={styles.meta}>
        Moving the pin also moves the vendor to the city it falls in, unless an admin has pinned
        their city.
      </p>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.actions}>
        <button
          type="button"
          className={`${styles.button} ${styles.buttonGhost}`}
          disabled={busy}
          onClick={onDone}
        >
          Cancel
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.buttonPrimary}`}
          disabled={!canSave}
          onClick={save}
        >
          Save profile
        </button>
      </div>
    </div>
  );
}

const BANK_FIELDS: { key: keyof VendorAccountDetailsInputDto; label: string }[] = [
  { key: 'accountHolderName', label: 'Account holder' },
  { key: 'bankName', label: 'Bank name' },
  { key: 'ifscCode', label: 'IFSC' },
  { key: 'branchName', label: 'Branch' },
  { key: 'accountNumber', label: 'Account number' },
];

function BankForm({ vendor, onDone }: { vendor: AdminVendorDto; onDone: () => void }) {
  const mutation = useUpdateVendorBankMutation();
  const existing = vendor.accountDetails;
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<VendorAccountDetailsInputDto>({
    accountHolderName: existing?.accountHolderName ?? '',
    bankName: existing?.bankName ?? '',
    ifscCode: existing?.ifscCode ?? '',
    branchName: existing?.branchName ?? '',
    accountNumber: existing?.accountNumber ?? '',
  });

  const body: VendorAccountDetailsInputDto = {
    accountHolderName: draft.accountHolderName.trim(),
    bankName: draft.bankName.trim(),
    ifscCode: draft.ifscCode.trim().toUpperCase(),
    branchName: draft.branchName.trim(),
    accountNumber: draft.accountNumber.trim(),
  };
  const complete = BANK_FIELDS.every(({ key }) => body[key] !== '');
  const changed = !existing || BANK_FIELDS.some(({ key }) => body[key] !== existing[key]);
  const canSave = complete && changed && !mutation.isPending;

  const save = async () => {
    setError(null);
    try {
      await mutation.mutateAsync({ vendorId: vendor.id, body });
      onDone();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Request failed');
    }
  };

  const busy = mutation.isPending;
  return (
    <div>
      {BANK_FIELDS.map(({ key, label }) => (
        <Field
          key={key}
          id={`vendor-bank-${key}`}
          label={label}
          value={draft[key]}
          disabled={busy}
          onChange={(value) => setDraft({ ...draft, [key]: value })}
        />
      ))}
      <p className={styles.meta}>All five fields are needed. Payouts go to this account.</p>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.actions}>
        <button
          type="button"
          className={`${styles.button} ${styles.buttonGhost}`}
          disabled={busy}
          onClick={onDone}
        >
          Cancel
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.buttonPrimary}`}
          disabled={!canSave}
          onClick={save}
        >
          Save bank details
        </button>
      </div>
    </div>
  );
}
