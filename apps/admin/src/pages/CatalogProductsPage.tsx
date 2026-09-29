import { useMemo, useState } from 'react';
import { isEmpty } from 'lodash';

import { ProductDetailModal } from '@/components/catalog/ProductDetailModal';
import {
  useCategoryTreeQuery,
  useProductsQuery,
  usePublishProductMutation,
  useUnpublishProductMutation,
} from '@/queries/useCatalogQueries';
import styles from '@/styles/shared.module.css';
import catalogStyles from '@/styles/catalog.module.css';
import type { CategoryNode, ProductStatus } from '@/types/catalog.types';
import { formatDateTime } from '@/utils/date';

const STATUS_FILTERS: Array<{ label: string; value: ProductStatus | 'all' }> = [
  { label: 'All', value: 'all' },
  { label: 'Draft', value: 'draft' },
  { label: 'Live', value: 'live' },
  { label: 'Deprecated', value: 'deprecated' },
];

// Flattened for the <select> — the tree shape matters on the Categories page,
// but here it is just a filter, and an indented flat list is easier to scan.
function flatten(nodes: CategoryNode[], depth = 0): Array<{ node: CategoryNode; depth: number }> {
  return nodes.flatMap((node) => [{ node, depth }, ...flatten(node.children, depth + 1)]);
}

export function CatalogProductsPage() {
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [status, setStatus] = useState<ProductStatus | 'all'>('all');
  const [categoryId, setCategoryId] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const treeQuery = useCategoryTreeQuery();
  const productsQuery = useProductsQuery({
    search: submittedSearch || undefined,
    status: status === 'all' ? undefined : status,
    categoryId: categoryId || undefined,
    limit: 50,
  });
  const publishMutation = usePublishProductMutation();
  const unpublishMutation = useUnpublishProductMutation();

  const categoryOptions = useMemo(() => flatten(treeQuery.data ?? []), [treeQuery.data]);
  const products = productsQuery.data?.items ?? [];
  const isSubmitting = publishMutation.isPending || unpublishMutation.isPending;

  const handlePublish = async (productId: string) => {
    setActionError(null);
    try {
      await publishMutation.mutateAsync(productId);
    } catch (error) {
      // The required-variant-attributes guard rejects a publish and names the
      // missing attribute — surface that verbatim, it is the actionable part.
      setActionError(error instanceof Error ? error.message : 'Could not publish this product.');
    }
  };

  const handleUnpublish = async (productId: string) => {
    setActionError(null);
    try {
      await unpublishMutation.mutateAsync(productId);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not withdraw this product.');
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
        {STATUS_FILTERS.map((filter) => (
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

      {actionError ? <p className={styles.error}>{actionError}</p> : null}

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
                  <tr
                    key={product.id}
                    className={styles.clickableRow}
                    onClick={() => setSelectedId(product.id)}
                  >
                    <td>
                      <code>{product.productCode}</code>
                    </td>
                    <td>{product.name}</td>
                    <td className={catalogStyles.pathCell}>{product.categoryPath}</td>
                    <td>{product.brand ?? '—'}</td>
                    <td>
                      <span className={catalogStyles[`status_${product.status}`]}>
                        {product.status}
                      </span>
                    </td>
                    <td>{product.listingCount}</td>
                    <td>{formatDateTime(product.updatedAt)}</td>
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
