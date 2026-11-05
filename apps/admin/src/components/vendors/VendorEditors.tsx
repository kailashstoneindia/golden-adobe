import { useState } from 'react';
import type { AdminVendorDto, UpdateVendorProfileDto } from '@golden-abode/types';

import { BankDetailsForm } from '@/components/common/BankDetailsForm';
import { FormField } from '@/components/common/FormField';
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

function ProfileForm({ vendor: live, onDone }: { vendor: AdminVendorDto; onDone: () => void }) {
  const mutation = useUpdateVendorProfileMutation();
  const [error, setError] = useState<string | null>(null);
  // What the form was opened with. Changes are worked out against this, not the
  // live record: the popup refreshes in the background, and an untouched box must
  // not overwrite a change made elsewhere meanwhile.
  const [vendor] = useState(live);
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
  const pinIsValid =
    draft.latitude.trim() !== '' &&
    draft.longitude.trim() !== '' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude);
  // The pin moves as a pair: if either changed, both go.
  if (pinIsValid && (latitude !== vendor.latitude || longitude !== vendor.longitude)) {
    changes.latitude = latitude;
    changes.longitude = longitude;
  }
  // A GSTIN or UPI id cannot be removed from here (the server stores an empty
  // string, not "none"), so a blank box means "leave it" and says so.
  const gstin = draft.gstin.trim().toUpperCase();
  const upiId = draft.upiId.trim();
  const clearedSomething = (gstin === '' && !!vendor.gstin) || (upiId === '' && !!vendor.upiId);
  if (gstin !== '' && gstin !== (vendor.gstin ?? '')) changes.gstin = gstin;
  if (upiId !== '' && upiId !== (vendor.upiId ?? '')) changes.upiId = upiId;
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
      <FormField
        id="vendor-shop-name"
        label="Shop name"
        value={draft.shopName}
        disabled={busy}
        onChange={set('shopName')}
      />
      <FormField
        id="vendor-address"
        label="Address"
        value={draft.address}
        disabled={busy}
        onChange={set('address')}
      />
      <FormField
        id="vendor-latitude"
        label="Latitude"
        type="number"
        value={draft.latitude}
        disabled={busy}
        onChange={set('latitude')}
      />
      <FormField
        id="vendor-longitude"
        label="Longitude"
        type="number"
        value={draft.longitude}
        disabled={busy}
        onChange={set('longitude')}
      />
      <FormField
        id="vendor-gstin"
        label="GSTIN"
        value={draft.gstin}
        disabled={busy}
        onChange={set('gstin')}
      />
      <FormField
        id="vendor-upi"
        label="UPI ID"
        value={draft.upiId}
        disabled={busy}
        onChange={set('upiId')}
      />
      <FormField
        id="vendor-min-order"
        label="Minimum order (₹)"
        type="number"
        value={draft.minOrderValue}
        disabled={busy}
        onChange={set('minOrderValue')}
      />
      <p className={styles.meta}>Enter 0 for no minimum order.</p>
      {clearedSomething ? (
        <p className={styles.meta}>
          GSTIN and UPI ID cannot be cleared here; a blank box leaves the saved value as it is.
        </p>
      ) : null}
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

function BankForm({ vendor, onDone }: { vendor: AdminVendorDto; onDone: () => void }) {
  const mutation = useUpdateVendorBankMutation();
  return (
    <BankDetailsForm
      existing={vendor.accountDetails}
      onCancel={onDone}
      onSave={async (body) => {
        await mutation.mutateAsync({ vendorId: vendor.id, body });
        onDone();
      }}
    />
  );
}
