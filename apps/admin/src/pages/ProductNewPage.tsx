import { useState } from 'react';
import { Link } from 'react-router-dom';

import { ProductForm } from '@/components/catalog/ProductForm';
import { ReadinessChecklist, useHasBlockingGap } from '@/components/catalog/ReadinessChecklist';
import { ProductMediaPanel } from '@/components/catalog/media/ProductMediaPanel';
import { ROUTES } from '@/constants/routes';
import { useProductQuery, usePublishProductMutation } from '@/queries/useCatalogQueries';
import styles from '@/styles/shared.module.css';

// Decision 0063: add one product without a spreadsheet. The draft is saved
// first; then its images go on and the checklist shows what publishing needs.
export function ProductNewPage() {
  const [productId, setProductId] = useState<string | null>(null);

  return (
    <section>
      <h2 className={styles.pageTitle}>New product</h2>
      <p className={styles.pageSubtitle}>
        Saved as a draft. Add at least one image and the starred attributes, then publish.
      </p>
      {productId ? (
        <AfterSave productId={productId} />
      ) : (
        <ProductForm mode="create" onSaved={setProductId} />
      )}
    </section>
  );
}

function AfterSave({ productId }: { productId: string }) {
  const product = useProductQuery(productId);
  const publish = usePublishProductMutation();
  const blocked = useHasBlockingGap(productId);
  const [error, setError] = useState<string | null>(null);
  const isLive = product.data?.status === 'live';

  return (
    <div className={styles.modalBody}>
      <p className={styles.hint}>
        Draft {product.data?.productCode ?? ''} saved.{' '}
        <Link to={ROUTES.catalogProducts}>Back to products</Link>
      </p>
      <ProductMediaPanel productId={productId} />
      <h3 className={styles.sectionTitle}>Ready to publish?</h3>
      <ReadinessChecklist productId={productId} />
      {error ? <p className={styles.error}>{error}</p> : null}
      <div className={styles.actions}>
        {isLive ? (
          <p className={styles.hint}>Published.</p>
        ) : (
          <button
            type="button"
            className={`${styles.button} ${styles.buttonPrimary}`}
            disabled={blocked || publish.isPending}
            onClick={async () => {
              setError(null);
              try {
                await publish.mutateAsync(productId);
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : 'Could not publish');
              }
            }}
          >
            Publish
          </button>
        )}
      </div>
    </div>
  );
}
