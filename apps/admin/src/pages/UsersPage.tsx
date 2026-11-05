import { useMemo, useState } from 'react';
import { keepPreviousData } from '@tanstack/react-query';
import { Role } from '@golden-abode/types';
import { isEmpty } from 'lodash';

import { APP_CONSTANTS } from '@/constants/appConstants';
import { ERROR_MESSAGES } from '@/constants/error.constants';
import { UserDetailModal } from '@/components/approvals/UserDetailModal';
import {
  useAdminUserQuery,
  useAdminUsersQuery,
  useApproveUserMutation,
  useRejectUserMutation,
} from '@/queries';
import styles from '@/styles/shared.module.css';
import { formatPhoneDisplay } from '@/utils/phone';
import { formatRoleLabel } from '@/utils/role';
import { formatDateTime } from '@/utils/date';
import { formatOnboardingStage } from '@/utils/onboarding';

export function UsersPage() {
  const [page, setPage] = useState(1);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const usersQuery = useAdminUsersQuery(
    { page, limit: APP_CONSTANTS.defaultPageSize },
    { placeholderData: keepPreviousData },
  );
  // The popup shows the full detail (sessions, customer profile); the list
  // row stands in until it arrives (decision 0058 Task 7).
  const detailQuery = useAdminUserQuery(selectedUserId);
  const approveMutation = useApproveUserMutation();
  const rejectMutation = useRejectUserMutation();

  const users = useMemo(() => usersQuery.data?.items ?? [], [usersQuery.data?.items]);
  const selectedUser = detailQuery.data ?? users.find((user) => user.id === selectedUserId) ?? null;
  const isSubmitting = approveMutation.isPending || rejectMutation.isPending;
  const showApprovalActions =
    selectedUser?.role === Role.VENDOR || selectedUser?.role === Role.ARTISAN;

  // The server can refuse, e.g. approving an ustaad with no document
  // (decision 0058 §3b); keep the popup open and show why.
  const [actionError, setActionError] = useState<string | null>(null);

  const runAction = async (action: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await action();
      setSelectedUserId(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Request failed');
    }
  };

  const handleApprove = (userId: string) => runAction(() => approveMutation.mutateAsync(userId));

  const handleReject = (userId: string, reason?: string) =>
    runAction(() => rejectMutation.mutateAsync({ userId, reason }));

  const closeModal = () => {
    setSelectedUserId(null);
    setActionError(null);
  };

  if (usersQuery.isLoading) {
    return <p className={styles.pageSubtitle}>Loading users…</p>;
  }

  if (usersQuery.isError) {
    return <p className={styles.error}>{ERROR_MESSAGES.loadUsersFailed}</p>;
  }

  const data = usersQuery.data;

  return (
    <section>
      <h2 className={styles.pageTitle}>All users</h2>
      <p className={styles.pageSubtitle}>Browse every account registered on Kailash Stones</p>

      {isEmpty(users) ? (
        <div className={styles.empty}>No users found.</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Account</th>
                <th>Approved</th>
                <th>Onboarding</th>
                <th>Joined</th>
                <th>Last login</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr
                  key={user.id}
                  className={styles.clickableRow}
                  onClick={() => setSelectedUserId(user.id)}
                >
                  <td>{user.name}</td>
                  <td>{formatRoleLabel(user.role)}</td>
                  <td>{formatPhoneDisplay(user.phone)}</td>
                  <td>{user.email ?? '—'}</td>
                  <td>{user.isActive ? 'Active' : 'Deactivated'}</td>
                  <td>{user.isApproved ? 'Yes' : 'No'}</td>
                  <td>{formatOnboardingStage(user)}</td>
                  <td>{formatDateTime(user.createdAt)}</td>
                  <td>{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Never'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.totalPages > 1 ? (
        <div className={styles.actions}>
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </button>
          <span className={styles.meta}>
            Page {data.page} of {data.totalPages} ({data.total} users)
          </span>
          <button
            type="button"
            disabled={page >= data.totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      ) : null}

      {selectedUser ? (
        <UserDetailModal
          user={selectedUser}
          isSubmitting={isSubmitting}
          showApprovalActions={showApprovalActions}
          // A vendor rejection is stored with its reason (decisions 0048, 0058 F2).
          requireRejectReason={selectedUser.role === Role.VENDOR}
          actionError={actionError}
          onClose={closeModal}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      ) : null}
    </section>
  );
}
