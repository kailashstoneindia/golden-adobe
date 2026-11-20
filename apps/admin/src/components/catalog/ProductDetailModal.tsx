import { useMemo, useState, type ReactNode } from 'react';
import { isEmpty } from 'lodash';

import { ProductMediaPanel } from '@/components/catalog/media/ProductMediaPanel';
import {
  useDeleteProductMutation,
  useProductQuery,
  useRestoreProductMutation,
  useRetireProductMutation,
} from '@/queries/useCatalogQueries';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { MergeProductDialog } from '@/components/catalog/MergeProductDialog';
import { ApiClientError } from '@/services';
import { ProductNameEditor } from '@/components/catalog/ProductNameEditor';
import { ProductForm, type ProductFormValues } from '@/components/catalog/ProductForm';
import { ReadinessChecklist, useHasBlockingGap } from '@/components/catalog/ReadinessChecklist';
import { labelFor, PRODUCT_STATUS_LABELS } from '@/constants/labels';
import styles from '@/styles/shared.module.css';
import catalogStyles from '@/styles/catalog.module.css';
import { formatDateTime } from '@/utils/date';
import { formatPaise, rupeesToPaise } from '@/utils/money';
import type { ProductDetail, ProductListing } from '@/types/catalog.types';

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
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState<'retire' | 'delete' | null>(null);
  const [merging, setMerging] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const retire = useRetireProductMutation();
  const restore = useRestoreProductMutation();
  const remove = useDeleteProductMutation();
  const acting = retire.isPending || restore.isPending || remove.isPending;
  // Decision 0063: retire, restore and delete, with the server's reason on refusal.
  const run = async (action: () => Promise<unknown>, after?: () => void) => {
    setActionError(null);
    try {
      await action();
      setConfirming(null);
      after?.();
    } catch (caught) {
      setActionError(caught instanceof ApiClientError ? caught.message : 'That did not work');
    }
  };
  const isDraft = product?.status === 'draft';
  // Decision 0063: a draft shows what it still needs; Publish waits for it.
  const blocked = useHasBlockingGap(isDraft ? productId : null);
  const initial = useMemo(() => (product ? toFormValues(product) : undefined), [product]);

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div className={styles.modal} onClick={(event) => event.stopPropagation()} role="dialog">
        {productQuery.isLoading ? (
          <p className={styles.pageSubtitle}>Loading product…</p>
        ) : productQuery.isError || !product ? (
          <p className={styles.error}>Could not load this product.</p>
        ) : editing ? (
          <>
            <h2 className={styles.modalTitle}>Edit {product.productCode}</h2>
            <ProductForm
              mode="edit"
              productId={product.id}
              initial={initial}
              categoryPath={product.categoryPath}
              isGeneric={product.isGeneric}
              onSaved={() => setEditing(false)}
              onCancel={() => setEditing(false)}
            />
          </>
        ) : (
          <>
            <ProductNameEditor productId={product.id} name={product.name} />
            <p className={catalogStyles.detailPath}>
              <code>{product.productCode}</code> · {product.categoryPath}
            </p>

            {product.description ? (
              <p className={styles.pageSubtitle}>{product.description}</p>
            ) : null}

            <div className={styles.modalBody}>
              <div className={styles.detailSections}>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Status</span>
                  <span className={styles.detailValue}>
                    <span className={catalogStyles[`status_${product.status}`]}>
                      {labelFor(PRODUCT_STATUS_LABELS, product.status)}
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
                <Row label="Family">{product.productFamily ?? '—'}</Row>
                <Row label="Stone variety">{product.stoneVariety ?? '—'}</Row>
                <Row label="Unit">{product.unitOfMeasure ?? '—'}</Row>
                <Row label="Sold as">{soldAs(product)}</Row>
                <Row label="Natural variation">{product.hasNaturalVariation ? 'Yes' : 'No'}</Row>
                <Row label="Importer">{product.importerDetails ?? '—'}</Row>
                <Row label="Best price">
                  {product.bestPrice === null
                    ? '—'
                    : `${rupees(product.bestPrice)}${
                        product.bestVendorName ? ` at ${product.bestVendorName}` : ''
                      }`}
                </Row>
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

              <VendorListings
                listings={product.listings}
                tintedToOrder={product.saleUnitType === 'tinted_to_order'}
              />

              <ProductMediaPanel productId={product.id} />

              {isDraft ? (
                <section aria-label="Ready to publish">
                  <h4 className={catalogStyles.detailTitle}>Ready to publish?</h4>
                  <ReadinessChecklist productId={product.id} />
                </section>
              ) : null}
            </div>

            <div className={styles.actions}>
              <button type="button" className={styles.buttonGhost} onClick={onClose}>
                Close
              </button>
              {product.status !== 'deprecated' ? (
                <>
                  <button
                    type="button"
                    className={styles.buttonGhost}
                    onClick={() => setEditing(true)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className={styles.buttonGhost}
                    onClick={() => setMerging(true)}
                  >
                    Merge into…
                  </button>
                  <button
                    type="button"
                    className={styles.buttonGhost}
                    disabled={acting}
                    onClick={() => setConfirming('retire')}
                  >
                    Retire
                  </button>
                </>
              ) : product.mergedIntoId ? null : (
                <button
                  type="button"
                  className={styles.buttonGhost}
                  disabled={acting}
                  onClick={() => void run(() => restore.mutateAsync(product.id))}
                >
                  Restore
                </button>
              )}
              {isDraft ? (
                <button
                  type="button"
                  className={styles.buttonDanger}
                  disabled={acting}
                  onClick={() => setConfirming('delete')}
                >
                  Delete
                </button>
              ) : null}
              {product.status === 'deprecated' ? null : product.status === 'live' ? (
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
                  disabled={isSubmitting || (isDraft && blocked)}
                  onClick={() => onPublish(product.id)}
                >
                  {isSubmitting ? 'Working…' : 'Publish'}
                </button>
              )}
            </div>
            {actionError && !confirming ? <p className={styles.error}>{actionError}</p> : null}

            {confirming === 'retire' ? (
              <ConfirmDialog
                title="Retire this product?"
                message="It leaves the catalog. Active vendor listings will be paused, so nobody can buy it. You can restore it later as a draft."
                confirmLabel="Retire product"
                busy={acting}
                error={actionError}
                onConfirm={() => void run(() => retire.mutateAsync(product.id))}
                onCancel={() => setConfirming(null)}
              />
            ) : null}
            {confirming === 'delete' ? (
              <ConfirmDialog
                title="Delete this draft?"
                message="The draft and its images are removed for good."
                confirmLabel="Delete draft"
                busy={acting}
                error={actionError}
                onConfirm={() => void run(() => remove.mutateAsync(product.id), onClose)}
                onCancel={() => setConfirming(null)}
              />
            ) : null}
            {merging ? (
              <MergeProductDialog source={product} onDone={() => setMerging(false)} />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.detailRow}>
      <span className={styles.detailLabel}>{label}</span>
      <span className={styles.detailValue}>{children}</span>
    </div>
  );
}

const SALE_UNIT_TEXT: Record<ProductDetail['saleUnitType'], string> = {
  discrete: 'Single items',
  cut_to_length: 'Cut to length',
  tinted_to_order: 'Tinted to order',
};

const LISTING_STATUS_TEXT: Record<ProductListing['status'], string> = {
  active: 'Active',
  paused: 'Paused',
  out_of_stock: 'Out of stock',
};

function soldAs(product: ProductDetail): string {
  const unit = SALE_UNIT_TEXT[product.saleUnitType] ?? product.saleUnitType;
  return product.packContentQty ? `${unit} · ${product.packContentQty} per pack` : unit;
}

// vendor_listing.price is stored in rupees.
function rupees(amount: number): string {
  return formatPaise(rupeesToPaise(amount));
}

// What a customer could buy is available minus held, the same sum checkout
// and search use. Paint is made to order and never has a stock row.
function stockText(listing: ProductListing, tintedToOrder: boolean): string {
  if (listing.quantityAvailable === null) {
    return tintedToOrder ? 'Not tracked (made to order)' : 'No stock row';
  }
  const held = listing.quantityReserved ?? 0;
  const free = Math.max(listing.quantityAvailable - held, 0);
  return `${listing.quantityAvailable} in stock · ${held} held · ${free} free`;
}

// Decision 0058 Task 8: everyone selling this product, live ones first.
function VendorListings({
  listings,
  tintedToOrder,
}: {
  listings: ProductListing[];
  tintedToOrder: boolean;
}) {
  return (
    <section role="group" aria-label="Vendor listings">
      <h4 className={catalogStyles.detailTitle}>Vendor listings</h4>
      {isEmpty(listings) ? (
        <div className={styles.sectionEmpty}>No vendor sells this product yet.</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Shop</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Status</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((listing) => (
                <tr key={listing.id}>
                  <td>
                    <div>{listing.shopName}</div>
                    <div className={styles.meta}>
                      {listing.vendorApproved ? 'Vendor approved' : 'Vendor not approved'}
                    </div>
                    {listing.statedGrade ? (
                      <div className={styles.meta}>Grade {listing.statedGrade}</div>
                    ) : null}
                    {listing.vendorSku ? (
                      <div className={styles.meta}>SKU {listing.vendorSku}</div>
                    ) : null}
                  </td>
                  <td>
                    <div>{rupees(listing.price)}</div>
                    {listing.mrp === null ? null : (
                      <div className={styles.meta}>MRP {rupees(listing.mrp)}</div>
                    )}
                  </td>
                  <td>{stockText(listing, tintedToOrder)}</td>
                  <td>{LISTING_STATUS_TEXT[listing.status] ?? listing.status}</td>
                  <td>{formatDateTime(listing.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function toFormValues(product: ProductDetail): Partial<ProductFormValues> {
  return {
    categoryId: product.categoryId,
    name: product.name,
    brandId: product.brandId,
    mfrPartNumber: product.mfrPartNumber ?? '',
    gtin: product.gtin ?? '',
    hsnCode: product.hsnCode,
    gstRate: String(product.gstRate),
    countryOfOrigin: product.countryOfOrigin,
    attributes: Object.fromEntries(product.attributeValues.map((a) => [a.code, a.value])),
  };
}
