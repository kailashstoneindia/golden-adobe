import { useState } from 'react';
import { isEmpty } from 'lodash';
import type { BrandDto } from '@golden-abode/types';

import { APP_CONSTANTS } from '@/constants/appConstants';
import { useBrandQuery, useBrandsQuery } from '@/queries';
import catalogStyles from '@/styles/catalog.module.css';
import styles from '@/styles/shared.module.css';

// The brand a merged one now points at. Fetched by id (cached), because the
// target is usually active and so not in an "inactive" list.
function MergedInto({ brandId }: { brandId: string }) {
  const target = useBrandQuery(brandId);
  return <>Merged into {target.data?.name ?? '…'}</>;
}

function StatusCell({ brand }: { brand: BrandDto }) {
  if (brand.mergedIntoId) return <MergedInto brandId={brand.mergedIntoId} />;
  return <span className={styles.badge}>{brand.isActive ? 'Active' : 'Inactive'}</span>;
}

// Decision 0063: brands are managed here instead of by seed scripts.
export function BrandsPage() {
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const brandsQuery = useBrandsQuery({
    search,
    isActive: !showInactive,
    page: 1,
    limit: APP_CONSTANTS.defaultPageSize,
  });
  const brands = brandsQuery.data?.items ?? [];

  return (
    <section>
      <h2 className={styles.pageTitle}>Brands</h2>
      <p className={styles.pageSubtitle}>
        Every product of a brand needs its manufacturer and consumer care details. Add a brand here
        before importing its products.
      </p>

      <div className={catalogStyles.filterBar}>
        <input
          className={styles.input}
          aria-label="Search brands"
          placeholder="Search by name or alias"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <label className={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(event) => setShowInactive(event.target.checked)}
          />
          Show inactive brands
        </label>
      </div>

      {brandsQuery.isLoading ? (
        <p className={styles.pageSubtitle}>Loading brands…</p>
      ) : brandsQuery.isError ? (
        <p className={styles.error}>Could not load brands.</p>
      ) : isEmpty(brands) ? (
        <div className={styles.empty}>No brands match.</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Manufacturer</th>
                <th>Products</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {brands.map((brand) => (
                <tr key={brand.id}>
                  <td>{brand.name}</td>
                  <td>{brand.manufacturerName}</td>
                  <td>{brand.productCount}</td>
                  <td>
                    <StatusCell brand={brand} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
