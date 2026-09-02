import { isEmpty } from 'lodash';

import { useProductQuery } from '@/queries/useCatalogQueries';
import styles from '@/styles/shared.module.css';
import catalogStyles from '@/styles/catalog.module.css';
import { formatDateTime } from '@/utils/date';

type ProductDetailModalProps = {
  productId: string;
  isSubmitting: boolean;
  onClose: () => void;
  onPublish: (productId: string) => void;
  onUnpublish: (productId: string) => void;
};

export function ProductDetailModal({
  productId,
  isSubmitting,
  onClose,
  onPublish,
  onUnpublish,
}: ProductDetailModalProps) {
  const productQuery = useProductQuery(productId);
  const product = productQuery.data;

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div className={styles.modal} onClick={(event) => event.stopPropagation()} role="dialog">
        {productQuery.isLoading ? (
          <p className={styles.pageSubtitle}>Loading product…</p>
        ) : productQuery.isError || !product ? (
          <p className={styles.error}>Could not load this product.</p>
        ) : (
          <>
            <h3 className={styles.modalTitle}>{product.name}</h3>
            <p className={catalogStyles.detailPath}>
              <code>{product.productCode}</code> · {product.categoryPath}
            </p>

            <div className={styles.modalBody}>
              <div className={styles.detailSections}>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Status</span>
                  <span className={styles.detailValue}>
                    <span className={catalogStyles[`status_${product.status}`]}>
                      {product.status}
                    </span>
                  </span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Brand</span>
                  <span className={styles.detailValue}>
                    {product.brand ?? (product.isGeneric ? 'Generic (unbranded)' : '—')}
                  </span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>MPN</span>
                  <span className={styles.detailValue}>{product.mfrPartNumber ?? '—'}</span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>GTIN</span>
                  <span className={styles.detailValue}>{product.gtin ?? '—'}</span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>HSN / GST</span>
                  <span className={styles.detailValue}>
                    {product.hsnCode ?? '—'} · {product.gstRate}%
                  </span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Country of origin</span>
                  <span className={styles.detailValue}>{product.countryOfOrigin}</span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Active vendor listings</span>
                  <span className={styles.detailValue}>{product.listingCount}</span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Last updated</span>
                  <span className={styles.detailValue}>{formatDateTime(product.updatedAt)}</span>
                </div>
              </div>

              <h4 className={catalogStyles.detailTitle}>Attributes</h4>
              {isEmpty(product.attributeValues) ? (
                <div className={styles.sectionEmpty}>
                  No attribute values recorded. A product whose identity depends on its attributes
                  cannot be published until the variant-defining ones are filled in.
                </div>
              ) : (
                <ul className={catalogStyles.attrList}>
                  {product.attributeValues.map((value) => (
                    <li key={value.code} className={catalogStyles.attrItem}>
                      <div className={catalogStyles.attrHead}>
                        <strong>{value.name}</strong>
                        {value.isVariantDefining ? (
                          <span className={catalogStyles.badgeVariant}>variant</span>
                        ) : null}
                      </div>
                      <div className={catalogStyles.attrMeta}>
                        {value.value}
                        {value.unit ? ` ${value.unit}` : ''}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className={styles.actions}>
              <button type="button" className={styles.buttonGhost} onClick={onClose}>
                Close
              </button>
              {product.status === 'live' ? (
                <button
                  type="button"
                  className={styles.buttonDanger}
                  disabled={isSubmitting}
                  onClick={() => onUnpublish(product.id)}
                >
                  {isSubmitting ? 'Working…' : 'Withdraw'}
                </button>
              ) : (
                <button
                  type="button"
                  className={styles.buttonPrimary}
                  disabled={isSubmitting}
                  onClick={() => onPublish(product.id)}
                >
                  {isSubmitting ? 'Working…' : 'Publish'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
