import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { isEmpty } from 'lodash';

import { APP_CONSTANTS } from '@/constants/appConstants';
import { ERROR_MESSAGES } from '@/constants/error.constants';
import { useArtisanByIdQuery, useArtisansQuery } from '@/queries';
import { labelFor, TRADE_TYPE_LABELS } from '@/constants/labels';
import { ArtisanDetailBody } from '@/components/artisans/ArtisanDetailBody';
import { ContactCell } from '@/components/common/ContactBlock';
import styles from '@/styles/shared.module.css';
import { formatDateTime } from '@/utils/date';

export function ArtisansPage() {
  // A user popup's "Open in Ustaads" link opens this page on that ustaad.
  const [searchParams] = useSearchParams();
  const [selectedArtisanId, setSelectedArtisanId] = useState<string | null>(
    searchParams.get('artisanId'),
  );
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
                <th>Owner</th>
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
                  <ContactCell contact={artisan.owner} />
                  <td>{labelFor(TRADE_TYPE_LABELS, artisan.tradeType)}</td>
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
              {detailQuery.data
                ? labelFor(TRADE_TYPE_LABELS, detailQuery.data.tradeType)
                : 'Artisan profile'}
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
