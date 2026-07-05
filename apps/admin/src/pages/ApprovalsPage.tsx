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

  const title = category === 'vendors' ? 'Vendor approvals' : 'Ustaad approvals';
  const isSubmitting = approveMutation.isPending || rejectMutation.isPending;

  const users = useMemo(() => usersQuery.data?.items ?? [], [usersQuery.data?.items]);

  const handleApprove = async (userId: string) => {
    await approveMutation.mutateAsync(userId);
    setSelectedUser(null);
  };

  const handleReject = async (userId: string) => {
    await rejectMutation.mutateAsync({ userId });
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
