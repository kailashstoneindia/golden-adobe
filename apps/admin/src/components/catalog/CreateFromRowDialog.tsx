import { useMemo, useState } from 'react';

import { useLinkReviewRowMutation, useReviewRowPrefillQuery } from '@/queries/useCatalogQueries';
import { ApiClientError, catalogService } from '@/services';
import styles from '@/styles/shared.module.css';
import type { ProductDetail } from '@/types/catalog.types';

import { ProductForm } from './ProductForm';

const messageOf = (error: unknown) =>
  error instanceof ApiClientError || error instanceof Error ? error.message : 'unknown error';

// Decision 0063: a vendor row that matched nothing becomes a new draft
// product, then the row is linked to it (which also teaches the matcher the
// vendor's SKU). If the link fails the product is kept and the link can be
// retried, so nothing is created twice.
export function CreateFromRowDialog({
  importRowId,
  onDone,
  onClose,
}: {
  importRowId: string;
  onDone: (message: string) => void;
  onClose: () => void;
}) {
  const prefillQuery = useReviewRowPrefillQuery(importRowId);
  const link = useLinkReviewRowMutation();
  const [created, setCreated] = useState<{ id: string; code: string } | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const prefill = prefillQuery.data;
  const initial = useMemo(
    () => (prefill ? { name: prefill.name, brandId: prefill.suggestedBrandId } : undefined),
    [prefill],
  );

  const linkTo = async (product: { id: string; code: string }) => {
    setLinkError(null);
    try {
      await link.mutateAsync({ importRowId, masterProductId: product.id });
      onDone(`${product.code} created and linked to the vendor’s row.`);
    } catch (error) {
      setLinkError(`${product.code} was created but not linked: ${messageOf(error)}`);
    }
  };

  const afterSave = async (productId: string, product?: ProductDetail) => {
    const code = product?.productCode ?? (await catalogService.fetchProduct(productId)).productCode;
    const saved = { id: productId, code };
    setCreated(saved);
    await linkTo(saved);
  };

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div
        className={styles.modal}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label="New product from vendor row"
      >
        <h2 className={styles.modalTitle}>New product from vendor row</h2>
        {!prefill ? (
          <p className={styles.hint}>
            {prefillQuery.isError ? 'Could not read the vendor row.' : 'Loading…'}
          </p>
        ) : created ? (
          <div className={styles.modalBody}>
            {linkError ? (
              <p className={styles.error}>{linkError}</p>
            ) : (
              <p className={styles.hint}>Linking…</p>
            )}
            <div className={styles.actions}>
              <button
                type="button"
                className={`${styles.button} ${styles.buttonPrimary}`}
                disabled={link.isPending}
                onClick={() => void linkTo(created)}
              >
                Link now
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className={styles.hint}>
              {`${prefill.vendorName} listed this as “${prefill.productRef ?? prefill.name}”`}
              {prefill.brandText ? `, brand “${prefill.brandText}”` : ''}.
            </p>
            <ProductForm
              mode="create"
              initial={initial}
              onSaved={(id, product) => void afterSave(id, product)}
              onCancel={onClose}
            />
          </>
        )}
      </div>
    </div>
  );
}
