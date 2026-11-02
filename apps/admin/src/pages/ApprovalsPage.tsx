import { useMemo, useState } from 'react';
import type { UserDto } from '@golden-abode/types';
import { Role } from '@golden-abode/types';
import { useLocation } from 'react-router-dom';
import { isEmpty } from 'lodash';

import { ERROR_MESSAGES } from '@/constants/error.constants';
import { ROUTES } from '@/constants/routes';
import { ApprovalCard } from '@/components/approvals/ApprovalCard';
import { UserDetailModal } from '@/components/approvals/UserDetailModal';
import {
  getPendingQueryForRole,
  useAdminUsersQuery,
  useApproveUserMutation,
  useRejectUserMutation,
} from '@/queries';
import { useApproveVendorMutation, useRejectVendorMutation } from '@/queries/useVendorsQueries';
import type { ApprovalCategory } from '@/types';
import styles from '@/styles/shared.module.css';

export function ApprovalsPage() {
  const location = useLocation();
  const category = resolveApprovalCategory(location.pathname);
  const role = category === 'vendors' ? Role.VENDOR : Role.ARTISAN;

  const [selectedUser, setSelectedUser] = useState<UserDto | null>(null);
  const usersQuery = useAdminUsersQuery(getPendingQueryForRole(role));
  const approveMutation = useApproveUserMutation();
  const rejectMutation = useRejectUserMutation();
  const approveVendorMutation = useApproveVendorMutation();
  const rejectVendorMutation = useRejectVendorMutation();

  const isVendorCategory = category === 'vendors';
  const title = isVendorCategory ? 'Vendor approvals' : 'Ustaad approvals';
  const isSubmitting =
    approveMutation.isPending ||
    rejectMutation.isPending ||
    approveVendorMutation.isPending ||
    rejectVendorMutation.isPending;

  const users = useMemo(() => usersQuery.data?.items ?? [], [usersQuery.data?.items]);

  // Vendors go through their own status-aware endpoints (decision 0048) so
  // rejection persists a reason and the row doesn't look identical to a
  // never-reviewed applicant. Artisans keep the generic, log-only path
  // until they get the same status-field treatment.
  // Falls back to the generic path when there's no vendorProfile yet (a
  // vendor who registered but never completed onboarding has no Vendor
  // row to carry a status) — not expected in the pending-approvals queue
  // in practice, but kept safe rather than erroring.
  const handleApprove = async (userId: string) => {
    const vendorId = selectedUser?.vendorProfile?.id;
    if (isVendorCategory && vendorId) {
      await approveVendorMutation.mutateAsync(vendorId);
    } else {
      await approveMutation.mutateAsync(userId);
    }
    setSelectedUser(null);
  };

  const handleReject = async (userId: string, reason?: string) => {
    const vendorId = selectedUser?.vendorProfile?.id;
    if (isVendorCategory && vendorId) {
      await rejectVendorMutation.mutateAsync({ vendorId, body: { reason: reason ?? '' } });
    } else {
      await rejectMutation.mutateAsync({ userId, reason });
    }
    setSelectedUser(null);
  };

  if (usersQuery.isLoading) {
    return <p className={styles.pageSubtitle}>Loading approval requests…</p>;
  }

  if (usersQuery.isError) {
    return <p className={styles.error}>{ERROR_MESSAGES.loadUsersFailed}</p>;
  }

  return (
    <section>
      <h2 className={styles.pageTitle}>{title}</h2>
      <p className={styles.pageSubtitle}>Tap a card to review details and approve or reject</p>

      {isEmpty(users) ? (
        <div className={styles.empty}>No pending requests in this category.</div>
      ) : (
        <div className={styles.grid}>
          {users.map((user) => (
            <ApprovalCard key={user.id} user={user} onSelect={setSelectedUser} />
          ))}
        </div>
      )}

      {selectedUser ? (
        <UserDetailModal
          user={selectedUser}
          isSubmitting={isSubmitting}
          requireRejectReason={isVendorCategory}
          onClose={() => setSelectedUser(null)}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      ) : null}
    </section>
  );
}

function resolveApprovalCategory(pathname: string): ApprovalCategory {
  if (pathname.includes(ROUTES.approvalsArtisans)) {
    return 'artisans';
  }
  return 'vendors';
}
