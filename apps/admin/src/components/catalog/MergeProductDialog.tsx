import { useState } from 'react';
import type { MergeResultDto } from '@golden-abode/types';

import { useMergeProductMutation, useProductsQuery } from '@/queries/useCatalogQueries';
import { ApiClientError } from '@/services';
import styles from '@/styles/shared.module.css';
import type { ProductDetail } from '@/types/catalog.types';

// Fold a duplicate product into the one that stays (decision 0063). Only
// products of the same category, not retired, can be picked.
export function MergeProductDialog({
  source,
  onDone,
}: {
  source: ProductDetail;
  onDone: () => void;
}) {
  const [search, setSearch] = useState('');
  const [intoId, setIntoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MergeResultDto | null>(null);
  const merge = useMergeProductMutation(source.id);
  const candidates = useProductsQuery({
    categoryId: source.categoryId,
    search: search.trim() || undefined,
    limit: 20,
  });
  const options = (candidates.data?.items ?? []).filter(
    (p) => p.id !== source.id && p.status !== 'deprecated',
  );

  const submit = async () => {
    if (!intoId) return;
    setError(null);
    try {
      setResult(await merge.mutateAsync(intoId));
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Could not merge the products');
    }
  };

  return (
    <div className={styles.overlay} onClick={onDone} role="presentation">
      <div
        className={styles.modal}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label={`Merge ${source.productCode}`}
      >
        <h2 className={styles.modalTitle}>Merge {source.productCode} into another product</h2>
        {result ? (
          <div className={styles.modalBody}>
            <p className={styles.hint}>
              {`Moved ${result.movedListings} listing${result.movedListings === 1 ? '' : 's'}.`}
            </p>
            {result.pausedListings.map((paused) => (
              <p key={paused.listingId} className={styles.hint}>
                {`Paused: ${paused.vendorName} (${paused.reason})`}
              </p>
            ))}
            <div className={styles.actions}>
              <button
                type="button"
                className={`${styles.button} ${styles.buttonPrimary}`}
                onClick={onDone}
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.modalBody}>
            <p className={styles.pageSubtitle}>
              Listings, vendor codes and (if the other product has none) images move over, and this
              product is retired. A vendor who lists both keeps the listing on the product you pick;
              their listing here is paused for review, never deleted.
            </p>
            <input
              className={`${styles.input} ${styles.pickerInput}`}
              aria-label="Find the product to keep"
              placeholder="Name, product code or part number"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <ul role="listbox" aria-label="Products" className={styles.pickerList}>
              {options.map((p) => (
                <li
                  key={p.id}
                  role="option"
                  aria-selected={p.id === intoId}
                  className={`${styles.pickerOption} ${p.id === intoId ? styles.pickerOptionActive : ''}`}
                  onClick={() => setIntoId(p.id)}
                >
                  {`${p.productCode} · ${p.name}`}
                </li>
              ))}
            </ul>
            {error ? <p className={styles.error}>{error}</p> : null}
            <div className={styles.actions}>
              <button
                type="button"
                className={`${styles.button} ${styles.buttonGhost}`}
                disabled={merge.isPending}
                onClick={onDone}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`${styles.button} ${styles.buttonDanger}`}
                disabled={!intoId || merge.isPending}
                onClick={submit}
              >
                Merge
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
