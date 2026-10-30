import { useState } from 'react';
import { isEmpty } from 'lodash';

import { APP_CONSTANTS } from '@/constants/appConstants';
import { ERROR_MESSAGES } from '@/constants/error.constants';
import { useArtisanByIdQuery, useArtisansQuery } from '@/queries';
import styles from '@/styles/shared.module.css';
import { formatDateTime } from '@/utils/date';

export function ArtisansPage() {
  const [selectedArtisanId, setSelectedArtisanId] = useState<string | null>(null);
  const artisansQuery = useArtisansQuery({ page: 1, limit: APP_CONSTANTS.defaultPageSize });
  const detailQuery = useArtisanByIdQuery(selectedArtisanId);

  const artisans = artisansQuery.data?.items ?? [];

  if (artisansQuery.isLoading) {
    return <p className={styles.pageSubtitle}>Loading artisans…</p>;
  }

  if (artisansQuery.isError) {
    return <p className={styles.error}>{ERROR_MESSAGES.loadUsersFailed}</p>;
  }

  return (
    <section>
      <h2 className={styles.pageTitle}>Artisans</h2>
      <p className={styles.pageSubtitle}>
        Every ustaad profile on the platform, verified or not. For KYC review, use Ustaad
        verification; for hiring activity, use Hire requests.
      </p>

      {isEmpty(artisans) ? (
        <div className={styles.empty}>No artisans yet.</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Trade</th>
                <th>Pincode</th>
                <th>Status</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {artisans.map((artisan) => (
                <tr
                  key={artisan.id}
                  className={styles.clickableRow}
                  onClick={() => setSelectedArtisanId(artisan.id)}
                >
                  <td>{artisan.tradeType}</td>
                  <td>{artisan.servicePincode || '—'}</td>
                  <td>
                    <span className={styles.badge}>
                      {artisan.isVerified ? 'Verified' : 'Unverified'}
                    </span>
                  </td>
                  <td>{formatDateTime(artisan.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedArtisanId ? (
        <div
          className={styles.overlay}
          onClick={() => setSelectedArtisanId(null)}
          role="presentation"
        >
          <div className={styles.modal} onClick={(event) => event.stopPropagation()} role="dialog">
            <h2 className={styles.modalTitle}>
              {detailQuery.data?.tradeType ?? 'Artisan profile'}
            </h2>
            <p className={styles.pageSubtitle}>Read-only profile — team and account details</p>

            {detailQuery.isLoading ? (
              <p className={styles.pageSubtitle}>Loading profile…</p>
            ) : detailQuery.data ? (
              <ArtisanDetailBody artisan={detailQuery.data} />
            ) : (
              <p className={styles.error}>Could not load this artisan.</p>
            )}

            <div className={styles.actions}>
              <button
                type="button"
                className={`${styles.button} ${styles.buttonGhost}`}
                onClick={() => setSelectedArtisanId(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

type ArtisanDetailBodyProps = {
  artisan: NonNullable<ReturnType<typeof useArtisanByIdQuery>['data']>;
};

function ArtisanDetailBody({ artisan }: ArtisanDetailBodyProps) {
  return (
    <div className={styles.modalBody}>
      <DetailRow label="Trade" value={artisan.tradeType} />
      <DetailRow
        label="Experience"
        value={artisan.experienceYears != null ? `${artisan.experienceYears} years` : '—'}
      />
      <DetailRow label="Service pincode" value={artisan.servicePincode || '—'} />
      <DetailRow label="Bio" value={artisan.bio || '—'} />
      <DetailRow label="Available" value={artisan.isAvailable ? 'Yes' : 'No'} />
      <DetailRow label="Verified" value={artisan.isVerified ? 'Yes' : 'No'} />
      <DetailRow label="Updated" value={formatDateTime(artisan.updatedAt)} />

      <section className={styles.detailSections}>
        <h3 className={styles.sectionTitle}>Team ({artisan.team.length})</h3>
        {isEmpty(artisan.team) ? (
          <p className={styles.sectionEmpty}>No team members added.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Phone</th>
                </tr>
              </thead>
              <tbody>
                {artisan.team.map((member) => (
                  <tr key={member.id}>
                    <td>{member.name || '—'}</td>
                    <td>{member.roleOnTeam || '—'}</td>
                    <td>{member.phone || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.detailSections}>
        <h3 className={styles.sectionTitle}>Bank account details</h3>
        {artisan.accountDetails ? (
          <>
            <DetailRow label="Account holder" value={artisan.accountDetails.accountHolderName} />
            <DetailRow label="Bank" value={artisan.accountDetails.bankName} />
            <DetailRow label="IFSC" value={artisan.accountDetails.ifscCode} />
            <DetailRow label="Branch" value={artisan.accountDetails.branchName} />
          </>
        ) : (
          <p className={styles.sectionEmpty}>No account details on file.</p>
        )}
      </section>
    </div>
  );
}

type DetailRowProps = {
  label: string;
  value: string;
};

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div className={styles.detailRow}>
      <span className={styles.detailLabel}>{label}</span>
      <span className={styles.detailValue}>{value}</span>
    </div>
  );
}
