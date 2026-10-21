import { useMemo, useState } from 'react';
import type { VendorProfileDto } from '@golden-abode/types';
import { isEmpty } from 'lodash';

import { VendorDetailModal } from '@/components/vendors/VendorDetailModal';
import { ERROR_MESSAGES } from '@/constants/error.constants';
import { useCategoryTreeQuery } from '@/queries/useCatalogQueries';
import {
  useCitiesQuery,
  useSetVendorCategoriesMutation,
  useSetVendorCityMutation,
  useVendorCategoriesQuery,
  useVendorsQuery,
} from '@/queries/useVendorsQueries';
import styles from '@/styles/shared.module.css';
import type { CategoryNode } from '@/types/catalog.types';
import { formatDateTime } from '@/utils/date';

export function VendorsPage() {
  const [selectedVendor, setSelectedVendor] = useState<VendorProfileDto | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const vendorsQuery = useVendorsQuery();
  const citiesQuery = useCitiesQuery();
  const treeQuery = useCategoryTreeQuery();
  const categoriesQuery = useVendorCategoriesQuery(selectedVendor?.id ?? null);
  const setCityMutation = useSetVendorCityMutation();
  const setCategoriesMutation = useSetVendorCategoriesMutation();

  const leafCategories = useMemo(
    () => leavesOf(treeQuery.data ?? []).map(toLeafOption),
    [treeQuery.data],
  );
  const isSubmitting = setCityMutation.isPending || setCategoriesMutation.isPending;

  const handleSaveCity = async (cityId: string | null): Promise<void> => {
    if (!selectedVendor) return;
    setActionError(null);
    try {
      const updated = await setCityMutation.mutateAsync({
        vendorId: selectedVendor.id,
        body: { cityId },
      });
      setSelectedVendor(updated);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : ERROR_MESSAGES.generic);
    }
  };

  const handleSaveCategories = async (categoryIds: string[]): Promise<void> => {
    if (!selectedVendor) return;
    setActionError(null);
    try {
      await setCategoriesMutation.mutateAsync({
        vendorId: selectedVendor.id,
        body: { categoryIds },
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : ERROR_MESSAGES.generic);
    }
  };

  if (vendorsQuery.isLoading) {
    return <p className={styles.pageSubtitle}>Loading vendors…</p>;
  }

  if (vendorsQuery.isError) {
    return <p className={styles.error}>{ERROR_MESSAGES.loadVendorsFailed}</p>;
  }

  const vendors = vendorsQuery.data ?? [];

  return (
    <section>
      <h2 className={styles.pageTitle}>Vendors</h2>
      <p className={styles.pageSubtitle}>
        Pin each shop to a launch city and set leaf categories for catalog export scope.
      </p>

      {isEmpty(vendors) ? (
        <div className={styles.empty}>No vendor profiles yet.</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Shop</th>
                <th>City</th>
                <th>GSTIN</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((vendor) => (
                <tr
                  key={vendor.id}
                  className={styles.clickableRow}
                  onClick={() => {
                    setActionError(null);
                    setSelectedVendor(vendor);
                  }}
                >
                  <td>{vendor.shopName}</td>
                  <td>{vendor.city?.name ?? '—'}</td>
                  <td>{vendor.gstin ?? '—'}</td>
                  <td>{formatDateTime(vendor.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedVendor ? (
        <VendorDetailModal
          vendor={selectedVendor}
          cities={citiesQuery.data ?? []}
          registeredCategories={categoriesQuery.data ?? []}
          leafCategories={leafCategories}
          isCitiesLoading={citiesQuery.isLoading}
          isCategoriesLoading={categoriesQuery.isLoading || treeQuery.isLoading}
          isSubmitting={isSubmitting}
          actionError={actionError}
          onClose={() => setSelectedVendor(null)}
          onSaveCity={handleSaveCity}
          onSaveCategories={handleSaveCategories}
        />
      ) : null}
    </section>
  );
}

function leavesOf(nodes: CategoryNode[]): CategoryNode[] {
  return nodes.flatMap((node) => (node.isLeaf ? [node] : leavesOf(node.children)));
}

function toLeafOption(node: CategoryNode): { id: string; path: string; name: string } {
  return { id: node.id, path: node.path, name: node.name };
}
