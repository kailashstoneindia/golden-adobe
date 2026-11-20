import { useState } from 'react';
import type { BrandDto } from '@golden-abode/types';

import { useMergeBrandMutation } from '@/queries';
import { ApiClientError } from '@/services';
import styles from '@/styles/shared.module.css';

import { BrandPicker } from './BrandPicker';

// Fold a duplicate brand into the one that stays (decision 0063). The server
// refuses, moving nothing, when a part number exists under both brands.
export function BrandMergeModal({
  brand,
  onMerged,
  onClose,
}: {
  brand: BrandDto;
  onMerged: () => void;
  onClose: () => void;
}) {
  const merge = useMergeBrandMutation(brand.id);
  const [intoId, setIntoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!intoId) return;
    setError(null);
    try {
      await merge.mutateAsync(intoId);
      onMerged();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Could not merge the brands');
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div
        className={styles.modal}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label={`Merge ${brand.name}`}
      >
        <h2 className={styles.modalTitle}>Merge {brand.name} into another brand</h2>
        <p className={styles.pageSubtitle}>
          This moves {brand.productCount} products and cannot be undone from the screen.
        </p>
        <p className={styles.hint}>
          {brand.name} will be deactivated and its name kept as another spelling of the brand you
          pick, so imports that still use it keep working.
        </p>
        <div className={styles.modalBody}>
          <BrandPicker value={intoId} onChange={setIntoId} excludeId={brand.id} />
          {error ? <p className={styles.error}>{error}</p> : null}
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonGhost}`}
            disabled={merge.isPending}
            onClick={onClose}
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
    </div>
  );
}
