import { useMemo, useState } from 'react';
import type { UserDto } from '@golden-abode/types';
import { Role } from '@golden-abode/types';
import { isEmpty } from 'lodash';

import { APP_CONSTANTS } from '@/constants/appConstants';
import { ERROR_MESSAGES } from '@/constants/error.constants';
import { UserDetailModal } from '@/components/approvals/UserDetailModal';
import {
  useAdminUsersQuery,
  useApproveUserMutation,
  useRejectUserMutation,
} from '@/queries';
import styles from '@/styles/shared.module.css';
import { formatPhoneDisplay } from '@/utils/phone';
import { formatRoleLabel } from '@/utils/role';
import { formatDateTime } from '@/utils/date';

export function UsersPage() {
  const [selectedUser, setSelectedUser] = useState<UserDto | null>(null);
  const usersQuery = useAdminUsersQuery({ page: 1, limit: APP_CONSTANTS.defaultPageSize });
  const approveMutation = useApproveUserMutation();
  const rejectMutation = useRejectUserMutation();

  const users = useMemo(() => usersQuery.data?.items ?? [], [usersQuery.data?.items]);
  const isSubmitting = approveMutation.isPending || rejectMutation.isPending;
  const showApprovalActions =
    selectedUser?.role === Role.VENDOR || selectedUser?.role === Role.ARTISAN;

  const handleApprove = async (userId: string) => {
    await approveMutation.mutateAsync(userId);
    setSelectedUser(null);
  };

  const handleReject = async (userId: string) => {
    await rejectMutation.mutateAsync({ userId });
    setSelectedUser(null);
  };

  if (usersQuery.isLoading) {
    return <p className={styles.pageSubtitle}>Loading users…</p>;
  }

  if (usersQuery.isError) {
    return <p className={styles.error}>{ERROR_MESSAGES.loadUsersFailed}</p>;
  }

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
                <th>Approved</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr
                  key={user.id}
                  className={styles.clickableRow}
                  onClick={() => setSelectedUser(user)}
                >
                  <td>{user.name}</td>
                  <td>{formatRoleLabel(user.role)}</td>
                  <td>{formatPhoneDisplay(user.phone)}</td>
                  <td>{user.isApproved ? 'Yes' : 'No'}</td>
                  <td>{formatDateTime(user.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedUser ? (
        <UserDetailModal
          user={selectedUser}
          isSubmitting={isSubmitting}
          showApprovalActions={showApprovalActions}
          onClose={() => setSelectedUser(null)}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      ) : null}
    </section>
  );
}
