import { useState } from 'react';

import { useBrandQuery, useSetBrandActiveMutation, useUpdateBrandMutation } from '@/queries';
import { ApiClientError } from '@/services';
import styles from '@/styles/shared.module.css';

import { BrandAliasesSection } from './BrandAliasesSection';
import { BrandFormModal } from './BrandFormModal';
import { BrandLogoSection } from './BrandLogoSection';

const messageOf = (error: unknown, fallback: string) =>
  error instanceof ApiClientError ? error.message : fallback;

// One brand: its compliance details, the active switch and the edit form
// (decision 0063).
export function BrandDetailModal({ brandId, onClose }: { brandId: string; onClose: () => void }) {
  const brandQuery = useBrandQuery(brandId);
  const update = useUpdateBrandMutation(brandId);
  const setActive = useSetBrandActiveMutation(brandId);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const brand = brandQuery.data;

  const toggleActive = async (isActive: boolean) => {
    setError(null);
    try {
      await setActive.mutateAsync(isActive);
    } catch (caught) {
      setError(messageOf(caught, 'Could not change the brand status'));
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div
        className={styles.modal}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label={brand?.name ?? 'Brand'}
      >
        {!brand ? (
          <p className={styles.pageSubtitle}>
            {brandQuery.isError ? 'Could not load the brand.' : 'Loading…'}
          </p>
        ) : (
          <>
            <h2 className={styles.modalTitle}>{brand.name}</h2>
            <div className={styles.modalBody}>
              {[
                ['Manufacturer', brand.manufacturerName],
                ['Address', brand.manufacturerAddress],
                ['Consumer care email', brand.consumerCareEmail],
                ['Consumer care phone', brand.consumerCarePhone],
                ['Products', String(brand.productCount)],
              ].map(([label, value]) => (
                <div key={label} className={styles.detailRow}>
                  <span className={styles.detailLabel}>{label}</span>
                  <span className={styles.detailValue}>{value}</span>
                </div>
              ))}
              {brand.mergedIntoId ? null : (
                <label className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={brand.isActive}
                    disabled={setActive.isPending}
                    onChange={(event) => toggleActive(event.target.checked)}
                  />
                  Active
                </label>
              )}
              {error ? <p className={styles.error}>{error}</p> : null}
              {brand.mergedIntoId ? null : (
                <>
                  <BrandLogoSection brand={brand} />
                  <BrandAliasesSection brand={brand} />
                </>
              )}
            </div>
            <div className={styles.actions}>
              {brand.mergedIntoId ? null : (
                <button
                  type="button"
                  className={`${styles.button} ${styles.buttonGhost}`}
                  onClick={() => setEditing(true)}
                >
                  Edit
                </button>
              )}
              <button
                type="button"
                className={`${styles.button} ${styles.buttonPrimary}`}
                onClick={onClose}
              >
                Close
              </button>
            </div>
          </>
        )}
      </div>
      {editing && brand ? (
        <div onClick={(event) => event.stopPropagation()} role="presentation">
          <BrandFormModal
            brand={brand}
            busy={update.isPending}
            onSubmit={(body) => update.mutateAsync(body)}
            onClose={() => setEditing(false)}
          />
        </div>
      ) : null}
    </div>
  );
}
