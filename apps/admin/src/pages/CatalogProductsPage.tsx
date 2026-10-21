import { useMemo, useState } from 'react';
import { isEmpty } from 'lodash';

import { ProductDetailModal } from '@/components/catalog/ProductDetailModal';
import {
  useBulkPublishProductsMutation,
  useCategoryTreeQuery,
  useProductsQuery,
  usePublishProductMutation,
  useUnpublishProductMutation,
} from '@/queries/useCatalogQueries';
import styles from '@/styles/shared.module.css';
import catalogStyles from '@/styles/catalog.module.css';
import {
  flattenCategoryOptions,
  formatBulkPublishResult,
  PRODUCT_STATUS_FILTERS,
  toggleProductId,
} from '@/utils/catalogProducts';
import { formatDateTime } from '@/utils/date';

export function CatalogProductsPage() {
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [status, setStatus] = useState<(typeof PRODUCT_STATUS_FILTERS)[number]['value']>('all');
  const [categoryId, setCategoryId] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);

  const treeQuery = useCategoryTreeQuery();
  const productsQuery = useProductsQuery({
    search: submittedSearch || undefined,
    status: status === 'all' ? undefined : status,
    categoryId: categoryId || undefined,
    limit: 50,
  });
  const publishMutation = usePublishProductMutation();
  const unpublishMutation = useUnpublishProductMutation();
  const bulkPublishMutation = useBulkPublishProductsMutation();

  const categoryOptions = useMemo(
    () => flattenCategoryOptions(treeQuery.data ?? []),
    [treeQuery.data],
  );
  const products = productsQuery.data?.items ?? [];
  const isSubmitting =
    publishMutation.isPending || unpublishMutation.isPending || bulkPublishMutation.isPending;
  const draftIdsOnPage = products
    .filter((product) => product.status === 'draft')
    .map((product) => product.id);
  const selectedDraftIds = selectedProductIds.filter((productId) =>
    draftIdsOnPage.includes(productId),
  );

  const handlePublish = async (productId: string): Promise<void> => {
    setActionError(null);
    setBulkMessage(null);
    try {
      await publishMutation.mutateAsync(productId);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not publish this product.');
    }
  };

  const handleUnpublish = async (productId: string): Promise<void> => {
    setActionError(null);
    setBulkMessage(null);
    try {
      await unpublishMutation.mutateAsync(productId);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not withdraw this product.');
    }
  };

  const handleBulkPublishSelected = async (): Promise<void> => {
    if (isEmpty(selectedDraftIds)) return;
    setActionError(null);
    setBulkMessage(null);
    try {
      const result = await bulkPublishMutation.mutateAsync({ productIds: selectedDraftIds });
      setBulkMessage(formatBulkPublishResult(result));
      setSelectedProductIds([]);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not bulk-publish products.');
    }
  };

  const handleBulkPublishCategory = async (): Promise<void> => {
    if (!categoryId) return;
    setActionError(null);
    setBulkMessage(null);
    try {
      const result = await bulkPublishMutation.mutateAsync({ categoryId });
      setBulkMessage(formatBulkPublishResult(result));
      setSelectedProductIds([]);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not bulk-publish category.');
    }
  };

  return (
    <section>
      <h2 className={styles.pageTitle}>Products</h2>
      <p className={styles.pageSubtitle}>
        Every catalog product, including drafts. Drafts have no vendor listing and are not
        searchable by customers until published.
      </p>

      <form
        className={catalogStyles.filterBar}
        onSubmit={(event) => {
          event.preventDefault();
          setSubmittedSearch(search.trim());
        }}
      >
        <input
          className={styles.input}
          placeholder="Search by name, product code, MPN or GTIN"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          className={styles.input}
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
        >
          <option value="">All categories</option>
          {categoryOptions.map(({ node, depth }) => (
            <option key={node.id} value={node.id}>
              {`${'  '.repeat(depth)}${node.name}`}
            </option>
          ))}
        </select>
        <button type="submit" className={styles.buttonPrimary}>
          Search
        </button>
      </form>

      <div className={styles.tabs}>
        {PRODUCT_STATUS_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            className={`${styles.tab} ${status === filter.value ? styles.tabActive : ''}`}
            onClick={() => setStatus(filter.value)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={`${styles.button} ${styles.buttonGhost}`}
          disabled={isEmpty(draftIdsOnPage) || isSubmitting}
          onClick={() => setSelectedProductIds(draftIdsOnPage)}
        >
          Select drafts on page
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.buttonGhost}`}
          disabled={isEmpty(selectedProductIds) || isSubmitting}
          onClick={() => setSelectedProductIds([])}
        >
          Clear selection
        </button>
        <button
          type="button"
          className={styles.buttonPrimary}
          disabled={isEmpty(selectedDraftIds) || isSubmitting}
          onClick={() => void handleBulkPublishSelected()}
        >
          Publish selected ({selectedDraftIds.length})
        </button>
        {categoryId ? (
          <button
            type="button"
            className={styles.buttonPrimary}
            disabled={isSubmitting}
            onClick={() => void handleBulkPublishCategory()}
          >
            Publish all drafts in category
          </button>
        ) : null}
      </div>

      {actionError ? <p className={styles.error}>{actionError}</p> : null}
      {bulkMessage ? <p className={styles.hint}>{bulkMessage}</p> : null}

      {productsQuery.isLoading ? (
        <p className={styles.pageSubtitle}>Loading products…</p>
      ) : productsQuery.isError ? (
        <p className={styles.error}>Could not load products.</p>
      ) : isEmpty(products) ? (
        <div className={styles.empty}>
          No products match these filters.
          {submittedSearch ? '' : ' The catalog may not have been seeded yet.'}
        </div>
      ) : (
        <>
          <p className={styles.hint}>
            Showing {products.length} of {productsQuery.data?.total ?? 0}
          </p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th aria-label="Select" />
                  <th>Code</th>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Brand</th>
                  <th>Status</th>
                  <th>Listings</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id} className={styles.clickableRow}>
                    <td onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        disabled={product.status !== 'draft' || isSubmitting}
                        checked={selectedProductIds.includes(product.id)}
                        onChange={() =>
                          setSelectedProductIds((currentIds) =>
                            toggleProductId(currentIds, product.id),
                          )
                        }
                        aria-label={`Select ${product.productCode}`}
                      />
                    </td>
                    <td onClick={() => setSelectedId(product.id)}>
                      <code>{product.productCode}</code>
                    </td>
                    <td onClick={() => setSelectedId(product.id)}>{product.name}</td>
                    <td
                      className={catalogStyles.pathCell}
                      onClick={() => setSelectedId(product.id)}
                    >
                      {product.categoryPath}
                    </td>
                    <td onClick={() => setSelectedId(product.id)}>{product.brand ?? '—'}</td>
                    <td onClick={() => setSelectedId(product.id)}>
                      <span className={catalogStyles[`status_${product.status}`]}>
                        {product.status}
                      </span>
                    </td>
                    <td onClick={() => setSelectedId(product.id)}>{product.listingCount}</td>
                    <td onClick={() => setSelectedId(product.id)}>
                      {formatDateTime(product.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {selectedId ? (
        <ProductDetailModal
          productId={selectedId}
          isSubmitting={isSubmitting}
          onClose={() => setSelectedId(null)}
          onPublish={handlePublish}
          onUnpublish={handleUnpublish}
        />
      ) : null}
    </section>
  );
}
