import { useMemo, useState } from 'react';
import type { UserDto } from '@golden-abode/types';
import { Role } from '@golden-abode/types';
import { isEmpty } from 'lodash';

import { ERROR_MESSAGES } from '@/constants/error.constants';
import { ApprovalCard } from '@/components/approvals/ApprovalCard';
import { UserDetailModal } from '@/components/approvals/UserDetailModal';
import {
  getPendingQueryForRole,
  useAdminUsersQuery,
  useApproveUserMutation,
  useRejectUserMutation,
} from '@/queries';
import { useApproveVendorMutation, useRejectVendorMutation } from '@/queries/useVendorsQueries';
import styles from '@/styles/shared.module.css';

export function ApprovalsPage() {
  // Vendors only: ustaad approval happens on the verification page since
  // decision 0058 (Verify also sets users.is_approved).

  const [selectedUser, setSelectedUser] = useState<UserDto | null>(null);
  const usersQuery = useAdminUsersQuery(getPendingQueryForRole(Role.VENDOR));
  const approveMutation = useApproveUserMutation();
  const rejectMutation = useRejectUserMutation();
  const approveVendorMutation = useApproveVendorMutation();
  const rejectVendorMutation = useRejectVendorMutation();

  const isSubmitting =
    approveMutation.isPending ||
    rejectMutation.isPending ||
    approveVendorMutation.isPending ||
    rejectVendorMutation.isPending;

  const users = useMemo(() => usersQuery.data?.items ?? [], [usersQuery.data?.items]);

  // Vendors go through their own status-aware endpoints (decision 0048) so
  // rejection persists a reason and the row doesn't look identical to a
  // never-reviewed applicant.
  // Falls back to the generic path when there's no vendorProfile yet (a
  // vendor who registered but never completed onboarding has no Vendor
  // row to carry a status) — not expected in the pending-approvals queue
  // in practice, but kept safe rather than erroring.
  const handleApprove = async (userId: string) => {
    const vendorId = selectedUser?.vendorProfile?.id;
    if (vendorId) {
      await approveVendorMutation.mutateAsync(vendorId);
    } else {
      await approveMutation.mutateAsync(userId);
    }
    setSelectedUser(null);
  };

  const handleReject = async (userId: string, reason?: string) => {
    const vendorId = selectedUser?.vendorProfile?.id;
    if (vendorId) {
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
      <h2 className={styles.pageTitle}>Vendor approvals</h2>
      <p className={styles.pageSubtitle}>Tap a card to review details and approve or reject</p>

      {isEmpty(users) ? (
        <div className={styles.empty}>No vendors waiting for approval.</div>
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
          requireRejectReason
          onClose={() => setSelectedUser(null)}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      ) : null}
    </section>
  );
}
