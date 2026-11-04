import type { ReactNode } from 'react';
import type { AdminArtisanDto } from '@golden-abode/types';

import { ContactBlock, Row } from '@/components/common/ContactBlock';
import { CopyableId } from '@/components/common/CopyButton';
import { labelFor, TRADE_TYPE_LABELS } from '@/constants/labels';
import styles from '@/styles/shared.module.css';
import { formatDateTime } from '@/utils/date';
import { formatPhoneDisplay } from '@/utils/phone';

// Everything the platform knows about an ustaad, for the directory and the
// verification popups (decision 0058 Task 6). Document links are short-lived
// signed URLs from GET /admin/artisans/:id; they open in a new tab.
export function ArtisanDetailBody({ artisan }: { artisan: AdminArtisanDto }) {
  const account = artisan.accountDetails;
  return (
    <div className={styles.modalBody}>
      <ContactBlock title="Owner" contact={artisan.owner}>
        <Row label="Ustaad id">
          <CopyableId value={artisan.id} label="ustaad id" />
        </Row>
      </ContactBlock>

      <Group title="Profile">
        <Row label="Trade">{labelFor(TRADE_TYPE_LABELS, artisan.tradeType)}</Row>
        <Row label="Experience">
          {artisan.experienceYears != null ? `${artisan.experienceYears} years` : '—'}
        </Row>
        <Row label="Service pincode">{artisan.servicePincode || '—'}</Row>
        <Row label="Bio">{artisan.bio || '—'}</Row>
        <Row label="Available">{artisan.isAvailable ? 'Yes' : 'No'}</Row>
        <Row label="Verified">{artisan.isVerified ? 'Yes' : 'No'}</Row>
        <Row label="Joined">{formatDateTime(artisan.createdAt)}</Row>
        <Row label="Updated">{formatDateTime(artisan.updatedAt)}</Row>
      </Group>

      <Group title="Documents">
        <Row label="Ustaad">
          <DocumentLink
            url={artisan.documentViewUrl}
            stored={artisan.documentUrl}
            storageAvailable={artisan.documentStorageAvailable}
            label="View ustaad document"
          />
        </Row>
      </Group>

      <Group title="Jobs">
        <p className={styles.meta}>
          {artisan.jobCounts.active} active · {artisan.jobCounts.completed} completed ·{' '}
          {artisan.jobCounts.declined} declined · {artisan.jobCounts.total} in total
        </p>
      </Group>

      <Group title="Team">
        {artisan.team.length === 0 ? (
          <p className={styles.sectionEmpty}>No team members added.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Phone</th>
                  <th>Document</th>
                </tr>
              </thead>
              <tbody>
                {artisan.team.map((member) => (
                  <tr key={member.id}>
                    <td>{member.name || '—'}</td>
                    <td>{member.roleOnTeam || '—'}</td>
                    <td>
                      {member.phone ? (
                        <a href={`tel:${member.phone}`}>{formatPhoneDisplay(member.phone)}</a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <DocumentLink
                        url={member.documentViewUrl}
                        stored={member.documentUrl}
                        storageAvailable={artisan.documentStorageAvailable}
                        label={`View document for ${member.name || 'team member'}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Group>

      <Group title="Bank">
        {account ? (
          <>
            <Row label="Account holder">{account.accountHolderName}</Row>
            <Row label="Bank">
              {account.bankName}, {account.branchName}
            </Row>
            <Row label="IFSC">{account.ifscCode}</Row>
            {/* Decision 0058 D4: the full number in a detail popup. */}
            <Row label="Account number">
              <CopyableId value={account.accountNumber} label="account number" />
            </Row>
          </>
        ) : (
          <p className={styles.sectionEmpty}>No account details on file.</p>
        )}
      </Group>
    </div>
  );
}

function DocumentLink({
  url,
  stored,
  storageAvailable,
  label,
}: {
  url: string | null;
  stored: string | null;
  storageAvailable: boolean;
  label: string;
}) {
  if (!url && stored && !storageAvailable) {
    // The file exists; the server just could not sign a link (no bucket set up).
    return <>Uploaded, but document storage is not set up</>;
  }
  if (!url) return <>No document</>;
  return (
    <a href={url} target="_blank" rel="noreferrer" aria-label={label}>
      View document
    </a>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section role="group" aria-label={title} className={styles.contactBlock}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      {children}
    </section>
  );
}
