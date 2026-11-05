import { useId, useState } from 'react';

import { FormField } from '@/components/common/FormField';
import styles from '@/styles/shared.module.css';

export type BankDetailsInput = {
  accountHolderName: string;
  bankName: string;
  ifscCode: string;
  branchName: string;
  accountNumber: string;
};

const FIELDS: { key: keyof BankDetailsInput; label: string }[] = [
  { key: 'accountHolderName', label: 'Account holder' },
  { key: 'bankName', label: 'Bank name' },
  { key: 'ifscCode', label: 'IFSC' },
  { key: 'branchName', label: 'Branch' },
  { key: 'accountNumber', label: 'Account number' },
];

// The bank form shared by the vendor and ustaad popups (decision 0058 Tasks 10
// and 11). All five fields are needed every time (a half-updated account is a
// failed payout), so Save stays off until they are all filled and something
// differs. A refusal from the server is shown in place and the form stays open.
export function BankDetailsForm({
  existing,
  onSave,
  onCancel,
}: {
  existing: BankDetailsInput | null;
  onSave: (body: BankDetailsInput) => Promise<void>;
  onCancel: () => void;
}) {
  const prefix = useId();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<BankDetailsInput>({
    accountHolderName: existing?.accountHolderName ?? '',
    bankName: existing?.bankName ?? '',
    ifscCode: existing?.ifscCode ?? '',
    branchName: existing?.branchName ?? '',
    accountNumber: existing?.accountNumber ?? '',
  });

  const body: BankDetailsInput = {
    accountHolderName: draft.accountHolderName.trim(),
    bankName: draft.bankName.trim(),
    ifscCode: draft.ifscCode.trim().toUpperCase(),
    branchName: draft.branchName.trim(),
    accountNumber: draft.accountNumber.trim(),
  };
  const complete = FIELDS.every(({ key }) => body[key] !== '');
  const changed = !existing || FIELDS.some(({ key }) => body[key] !== existing[key]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {FIELDS.map(({ key, label }) => (
        <FormField
          key={key}
          id={`${prefix}-${key}`}
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
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.buttonPrimary}`}
          disabled={busy || !complete || !changed}
          onClick={save}
        >
          Save bank details
        </button>
      </div>
    </div>
  );
}
