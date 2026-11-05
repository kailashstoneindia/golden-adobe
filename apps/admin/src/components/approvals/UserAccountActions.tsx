import { useState } from 'react';
import type { AdminUserDetailDto, AdminUserDto, UpdateAdminUserRequest } from '@golden-abode/types';

import styles from '@/styles/shared.module.css';

type Mode = 'idle' | 'editing' | 'confirm-deactivate' | 'confirm-sign-out';

type UserAccountActionsProps = {
  user: AdminUserDto | AdminUserDetailDto;
  onSaveDetails?: (userId: string, body: UpdateAdminUserRequest) => Promise<void>;
  onSetActive?: (userId: string, isActive: boolean) => Promise<void>;
  onRevokeSessions?: (userId: string) => Promise<void>;
};

// Decision 0058 Task 9: what an admin may do to an account — fix its name,
// email or phone, switch it off or on, and sign it out of every device. Each
// handler rejects with the server's reason, which is shown here.
export function UserAccountActions({
  user,
  onSaveDetails,
  onSetActive,
  onRevokeSessions,
}: UserAccountActionsProps) {
  const [mode, setMode] = useState<Mode>('idle');
  const [draft, setDraft] = useState({ name: '', email: '', phone: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!onSaveDetails && !onSetActive && !onRevokeSessions) {
    return null;
  }

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      setMode('idle');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };

  const startEditing = () => {
    setDraft({ name: user.name, email: user.email ?? '', phone: user.phone ?? '' });
    setError(null);
    setMode('editing');
  };

  // Only what the admin actually changed goes to the server.
  const changes: UpdateAdminUserRequest = {};
  if (draft.name.trim() !== user.name) changes.name = draft.name.trim();
  if (draft.email.trim() !== (user.email ?? '')) changes.email = draft.email.trim();
  if (draft.phone.trim() !== (user.phone ?? '')) changes.phone = draft.phone.trim();
  const hasChanges = Object.keys(changes).length > 0 && draft.name.trim() !== '';

  const cancel = () => {
    setError(null);
    setMode('idle');
  };
  const button = (variant: 'Ghost' | 'Danger' | 'Primary') =>
    `${styles.button} ${styles[`button${variant}`]}`;

  return (
    <section role="group" aria-label="Account actions" className={styles.detailSections}>
      <h3 className={styles.sectionTitle}>Account actions</h3>

      {mode === 'editing' && onSaveDetails ? (
        <div>
          {(['name', 'email', 'phone'] as const).map((field) => (
            <div key={field}>
              <label className={styles.label} htmlFor={`edit-user-${field}`}>
                {field === 'name' ? 'Name' : field === 'email' ? 'Email' : 'Phone'}
              </label>
              <input
                id={`edit-user-${field}`}
                className={styles.input}
                value={draft[field]}
                disabled={busy}
                onChange={(event) => setDraft({ ...draft, [field]: event.target.value })}
              />
            </div>
          ))}
          <p className={styles.meta}>
            The phone number is how this person logs in, so it must be a +91 number nobody else
            uses.
          </p>
          <div className={styles.actions}>
            <button type="button" className={button('Ghost')} disabled={busy} onClick={cancel}>
              Cancel
            </button>
            <button
              type="button"
              className={button('Primary')}
              disabled={busy || !hasChanges}
              onClick={() => run(() => onSaveDetails(user.id, changes))}
            >
              Save changes
            </button>
          </div>
        </div>
      ) : null}

      {mode === 'confirm-deactivate' && onSetActive ? (
        <div>
          <p>
            Deactivating {user.name} signs them out of every device and stops them logging in again,
            until you reactivate the account.
          </p>
          <div className={styles.actions}>
            <button type="button" className={button('Ghost')} disabled={busy} onClick={cancel}>
              Keep active
            </button>
            <button
              type="button"
              className={button('Danger')}
              disabled={busy}
              onClick={() => run(() => onSetActive(user.id, false))}
            >
              Confirm deactivate
            </button>
          </div>
        </div>
      ) : null}

      {mode === 'confirm-sign-out' && onRevokeSessions ? (
        <div>
          <p>
            This signs {user.name} out of every device. They can log in again with an OTP unless the
            account is deactivated.
          </p>
          <div className={styles.actions}>
            <button type="button" className={button('Ghost')} disabled={busy} onClick={cancel}>
              Cancel
            </button>
            <button
              type="button"
              className={button('Danger')}
              disabled={busy}
              onClick={() => run(() => onRevokeSessions(user.id))}
            >
              Confirm sign out
            </button>
          </div>
        </div>
      ) : null}

      {mode === 'idle' ? (
        <div className={styles.actions}>
          {onSaveDetails ? (
            <button type="button" className={button('Ghost')} onClick={startEditing}>
              Edit details
            </button>
          ) : null}
          {onRevokeSessions && 'activeSessionCount' in user ? (
            <button
              type="button"
              className={button('Ghost')}
              disabled={user.activeSessionCount === 0}
              onClick={() => setMode('confirm-sign-out')}
            >
              Sign out everywhere
            </button>
          ) : null}
          {onSetActive ? (
            user.isActive ? (
              <button
                type="button"
                className={button('Danger')}
                onClick={() => setMode('confirm-deactivate')}
              >
                Deactivate account
              </button>
            ) : (
              <button
                type="button"
                className={button('Primary')}
                disabled={busy}
                onClick={() => run(() => onSetActive(user.id, true))}
              >
                Reactivate account
              </button>
            )
          ) : null}
        </div>
      ) : null}

      {error ? <p className={styles.error}>{error}</p> : null}
    </section>
  );
}
