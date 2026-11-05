import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { isEmpty } from 'lodash';

import { VendorDetailModal } from '@/components/vendors/VendorDetailModal';
import { ERROR_MESSAGES } from '@/constants/error.constants';
import { useCategoryTreeQuery } from '@/queries/useCatalogQueries';
import {
  useApproveVendorMutation,
  useCitiesQuery,
  useRejectVendorMutation,
  useSetVendorCategoriesMutation,
  useSetVendorCityMutation,
  useVendorCategoriesQuery,
  useVendorsQuery,
} from '@/queries/useVendorsQueries';
import { labelFor, VENDOR_STATUS_LABELS } from '@/constants/labels';
import { ContactCell } from '@/components/common/ContactBlock';
import styles from '@/styles/shared.module.css';
import type { CategoryNode } from '@/types/catalog.types';
import { formatDateTime } from '@/utils/date';

export function VendorsPage() {
  // The id only: the popup always shows the latest list entry, so action
  // replies (the plain vendor profile) never replace the admin view.
  // A user popup's "Open in Vendors" link opens this page on that vendor.
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(
    searchParams.get('vendorId'),
  );
  const [actionError, setActionError] = useState<string | null>(null);

  const vendorsQuery = useVendorsQuery();
  const selectedVendor =
    vendorsQuery.data?.find((vendor) => vendor.id === selectedVendorId) ?? null;
  const citiesQuery = useCitiesQuery();
  const treeQuery = useCategoryTreeQuery();
  const categoriesQuery = useVendorCategoriesQuery(selectedVendor?.id ?? null);
  const setCityMutation = useSetVendorCityMutation();
  const setCategoriesMutation = useSetVendorCategoriesMutation();
  const approveMutation = useApproveVendorMutation();
  const rejectMutation = useRejectVendorMutation();

  const leafCategories = useMemo(
    () => leavesOf(treeQuery.data ?? []).map(toLeafOption),
    [treeQuery.data],
  );
  const isSubmitting =
    setCityMutation.isPending ||
    setCategoriesMutation.isPending ||
    approveMutation.isPending ||
    rejectMutation.isPending;

  const handleSaveCity = async (cityId: string | null): Promise<void> => {
    if (!selectedVendor) return;
    setActionError(null);
    try {
      await setCityMutation.mutateAsync({ vendorId: selectedVendor.id, body: { cityId } });
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

  const handleApprove = async (): Promise<void> => {
    if (!selectedVendor) return;
    setActionError(null);
    try {
      await approveMutation.mutateAsync(selectedVendor.id);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : ERROR_MESSAGES.generic);
    }
  };

  const handleReject = async (reason: string): Promise<void> => {
    if (!selectedVendor) return;
    setActionError(null);
    try {
      await rejectMutation.mutateAsync({ vendorId: selectedVendor.id, body: { reason } });
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
                <th>Owner</th>
                <th>Status</th>
                <th>City</th>
                <th>GSTIN</th>
                <th>Active listings</th>
                <th>Account</th>
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
                    setSelectedVendorId(vendor.id);
                  }}
                >
                  <td>{vendor.shopName}</td>
                  <ContactCell contact={vendor.owner} />
                  <td>{labelFor(VENDOR_STATUS_LABELS, vendor.status)}</td>
                  <td>{vendor.city?.name ?? '—'}</td>
                  <td>{vendor.gstin || '—'}</td>
                  <td>{vendor.listingCounts.active}</td>
                  {/* Decision 0058 D4: lists show only the last 4 digits. */}
                  <td>{maskAccount(vendor.accountDetails?.accountNumber)}</td>
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
          onClose={() => {
            setSelectedVendorId(null);
            // So a reload does not reopen it.
            setSearchParams({}, { replace: true });
          }}
          onSaveCity={handleSaveCity}
          onSaveCategories={handleSaveCategories}
          onApprove={handleApprove}
          onReject={handleReject}
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

function maskAccount(accountNumber: string | null | undefined): string {
  return accountNumber ? `•••• ${accountNumber.slice(-4)}` : '—';
}
