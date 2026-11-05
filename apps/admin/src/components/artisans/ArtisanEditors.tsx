import { useState } from 'react';
import {
  TRADE_TYPES,
  type AdminArtisanDto,
  type UpdateArtisanProfileDto,
} from '@golden-abode/types';

import { BankDetailsForm } from '@/components/common/BankDetailsForm';
import { FormField } from '@/components/common/FormField';
import { labelFor, TRADE_TYPE_LABELS } from '@/constants/labels';
import {
  useRemoveTeamMemberMutation,
  useUpdateArtisanBankMutation,
  useUpdateArtisanProfileMutation,
  useUpdateTeamMemberMutation,
} from '@/queries/useArtisansQueries';
import styles from '@/styles/shared.module.css';

type Mode = 'idle' | 'profile' | 'bank';

// Decision 0058 Task 11: fix an ustaad's profile and bank details. Profile
// saves send only what changed; the bank record goes whole. A refusal from the
// server is shown in place. Verification is never touched from here.
export function ArtisanEditors({ artisan }: { artisan: AdminArtisanDto }) {
  const [mode, setMode] = useState<Mode>('idle');
  const bankMutation = useUpdateArtisanBankMutation();
  return (
    <section role="group" aria-label="Edit ustaad" className={styles.contactBlock}>
      <h3 className={styles.sectionTitle}>Edit ustaad</h3>
      {mode === 'profile' ? (
        <ProfileForm artisan={artisan} onDone={() => setMode('idle')} />
      ) : mode === 'bank' ? (
        <BankDetailsForm
          existing={artisan.accountDetails}
          onCancel={() => setMode('idle')}
          onSave={async (body) => {
            await bankMutation.mutateAsync({ artisanId: artisan.id, body });
            setMode('idle');
          }}
        />
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
            {artisan.accountDetails ? 'Edit bank details' : 'Add bank details'}
          </button>
        </div>
      )}
    </section>
  );
}

function ProfileForm({ artisan, onDone }: { artisan: AdminArtisanDto; onDone: () => void }) {
  const mutation = useUpdateArtisanProfileMutation();
  const [error, setError] = useState<string | null>(null);
  // What the form was opened with. Changes are worked out against this, not
  // against the live record: the popup refreshes in the background, and an
  // untouched field must not overwrite a change made elsewhere meanwhile.
  const [base] = useState(artisan);
  const [draft, setDraft] = useState({
    tradeType: base.tradeType,
    experienceYears: base.experienceYears == null ? '' : String(base.experienceYears),
    servicePincode: base.servicePincode ?? '',
    bio: base.bio ?? '',
    isAvailable: base.isAvailable,
  });

  // Only what the admin changed goes to the server. The server cannot clear a
  // bio, pincode or experience, so a blank box means "leave it".
  const changes: UpdateArtisanProfileDto = {};
  if (draft.tradeType !== base.tradeType) changes.tradeType = draft.tradeType;
  const experience = Number(draft.experienceYears);
  const experienceIsValid =
    draft.experienceYears.trim() === '' || (Number.isInteger(experience) && experience >= 0);
  if (
    draft.experienceYears.trim() !== '' &&
    experienceIsValid &&
    experience !== base.experienceYears
  ) {
    changes.experienceYears = experience;
  }
  const pincode = draft.servicePincode.trim();
  if (pincode !== '' && pincode !== (base.servicePincode ?? '')) {
    changes.servicePincode = pincode;
  }
  const bio = draft.bio.trim();
  if (bio !== '' && bio !== (base.bio ?? '')) changes.bio = bio;
  if (draft.isAvailable !== base.isAvailable) changes.isAvailable = draft.isAvailable;

  const clearedSomething =
    (pincode === '' && !!base.servicePincode) ||
    (bio === '' && !!base.bio) ||
    (draft.experienceYears.trim() === '' && base.experienceYears != null);
  const busy = mutation.isPending;
  const canSave = Object.keys(changes).length > 0 && experienceIsValid && !busy;

  const save = async () => {
    setError(null);
    try {
      await mutation.mutateAsync({ artisanId: artisan.id, body: changes });
      onDone();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Request failed');
    }
  };

  return (
    <div>
      <div>
        <label className={styles.label} htmlFor="artisan-trade">
          Trade
        </label>
        <select
          id="artisan-trade"
          className={styles.input}
          value={draft.tradeType}
          disabled={busy}
          onChange={(event) =>
            setDraft({ ...draft, tradeType: event.target.value as typeof draft.tradeType })
          }
        >
          {TRADE_TYPES.map((trade) => (
            <option key={trade} value={trade}>
              {labelFor(TRADE_TYPE_LABELS, trade)}
            </option>
          ))}
        </select>
      </div>
      <FormField
        id="artisan-experience"
        label="Experience (years)"
        type="number"
        value={draft.experienceYears}
        disabled={busy}
        onChange={(value) => setDraft({ ...draft, experienceYears: value })}
      />
      {experienceIsValid ? null : <p className={styles.error}>Whole years only</p>}
      <FormField
        id="artisan-pincode"
        label="Service pincode"
        value={draft.servicePincode}
        disabled={busy}
        onChange={(value) => setDraft({ ...draft, servicePincode: value })}
      />
      <div>
        <label className={styles.label} htmlFor="artisan-bio">
          Bio
        </label>
        <textarea
          id="artisan-bio"
          className={styles.input}
          value={draft.bio}
          disabled={busy}
          onChange={(event) => setDraft({ ...draft, bio: event.target.value })}
        />
      </div>
      <label className={styles.label}>
        <input
          type="checkbox"
          checked={draft.isAvailable}
          disabled={busy}
          onChange={(event) => setDraft({ ...draft, isAvailable: event.target.checked })}
        />{' '}
        Available for work
      </label>
      {clearedSomething ? (
        <p className={styles.meta}>
          Bio, pincode and experience cannot be cleared here; a blank box leaves the saved value as
          it is.
        </p>
      ) : null}
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

type Member = AdminArtisanDto['team'][number];
type MemberMode = 'idle' | 'editing' | 'confirm-remove';

// Edit and remove for one row of the team table (decision 0058 Task 11). The
// member's document cannot be changed from here.
export function TeamMemberActions({ artisanId, member }: { artisanId: string; member: Member }) {
  const updateMutation = useUpdateTeamMemberMutation();
  const removeMutation = useRemoveTeamMemberMutation();
  const [mode, setMode] = useState<MemberMode>('idle');
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: '', roleOnTeam: '', phone: '' });
  // What the row held when editing began; changes are worked out against this, not
  // the live row, so a refresh in the background cannot be undone by an untouched box.
  const [base, setBase] = useState<Member>(member);
  // The role tells two members with the same name apart for screen readers.
  const label = `${member.name || 'team member'}${member.roleOnTeam ? ` (${member.roleOnTeam})` : ''}`;
  const busy = updateMutation.isPending || removeMutation.isPending;

  const startEditing = () => {
    setBase(member);
    setDraft({
      name: member.name ?? '',
      roleOnTeam: member.roleOnTeam ?? '',
      phone: member.phone ?? '',
    });
    setError(null);
    setMode('editing');
  };
  const cancel = () => {
    setError(null);
    setMode('idle');
  };
  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
      setMode('idle');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Request failed');
    }
  };

  // Blank means "leave it": the server cannot clear a member's field.
  const changes: { name?: string; roleOnTeam?: string; phone?: string } = {};
  for (const field of ['name', 'roleOnTeam', 'phone'] as const) {
    const value = draft[field].trim();
    if (value !== '' && value !== (base[field] ?? '')) changes[field] = value;
  }
  const button = (variant: 'Ghost' | 'Danger' | 'Primary') =>
    `${styles.button} ${styles[`button${variant}`]}`;

  return (
    <div>
      {mode === 'editing' ? (
        <div>
          <FormField
            id={`member-name-${member.id}`}
            label="Member name"
            value={draft.name}
            disabled={busy}
            onChange={(value) => setDraft({ ...draft, name: value })}
          />
          <FormField
            id={`member-role-${member.id}`}
            label="Member role"
            value={draft.roleOnTeam}
            disabled={busy}
            onChange={(value) => setDraft({ ...draft, roleOnTeam: value })}
          />
          <FormField
            id={`member-phone-${member.id}`}
            label="Member phone"
            value={draft.phone}
            disabled={busy}
            onChange={(value) => setDraft({ ...draft, phone: value })}
          />
          <div className={styles.actions}>
            <button type="button" className={button('Ghost')} disabled={busy} onClick={cancel}>
              Cancel
            </button>
            <button
              type="button"
              className={button('Primary')}
              disabled={busy || Object.keys(changes).length === 0}
              onClick={() =>
                run(() =>
                  updateMutation.mutateAsync({ artisanId, memberId: member.id, body: changes }),
                )
              }
            >
              Save member
            </button>
          </div>
        </div>
      ) : mode === 'confirm-remove' ? (
        <div>
          <p>
            Remove {member.name || 'this team member'} from this ustaad's team? Their details are
            deleted.
          </p>
          <div className={styles.actions}>
            <button type="button" className={button('Ghost')} disabled={busy} onClick={cancel}>
              Keep member
            </button>
            <button
              type="button"
              className={button('Danger')}
              disabled={busy}
              onClick={() =>
                run(() => removeMutation.mutateAsync({ artisanId, memberId: member.id }))
              }
            >
              Confirm remove
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.actions}>
          <button type="button" className={button('Ghost')} onClick={startEditing}>
            {`Edit ${label}`}
          </button>
          <button
            type="button"
            className={button('Danger')}
            onClick={() => setMode('confirm-remove')}
          >
            {`Remove ${label}`}
          </button>
        </div>
      )}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
