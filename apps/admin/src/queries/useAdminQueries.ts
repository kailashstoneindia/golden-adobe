import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ListUsersQuery } from '@golden-abode/types';
import { Role } from '@golden-abode/types';

import { APP_CONSTANTS } from '@/constants/appConstants';
import { adminService, authService } from '@/services';

export const ADMIN_QUERY_KEYS = {
  stats: ['admin', 'stats'] as const,
  users: (query: ListUsersQuery) => ['admin', 'users', query] as const,
  user: (userId: string) => ['admin', 'user', userId] as const,
};

export const AUTH_QUERY_KEYS = {
  me: ['auth', 'me'] as const,
};

export function useAdminStatsQuery() {
  return useQuery({
    queryKey: ADMIN_QUERY_KEYS.stats,
    queryFn: () => adminService.fetchStats(),
    staleTime: APP_CONSTANTS.statsStaleTimeMs,
  });
}

export function useAdminUsersQuery(query: ListUsersQuery) {
  return useQuery({
    queryKey: ADMIN_QUERY_KEYS.users(query),
    queryFn: () => adminService.fetchUsers(query),
    staleTime: APP_CONSTANTS.staleTimeMs,
  });
}

export function useAdminUserQuery(userId: string | null) {
  return useQuery({
    queryKey: ADMIN_QUERY_KEYS.user(userId ?? ''),
    queryFn: () => adminService.fetchUserById(userId!),
    enabled: Boolean(userId),
    staleTime: APP_CONSTANTS.staleTimeMs,
  });
}

export function useApproveUserMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => adminService.approveUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
  });
}

export function useRejectUserMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (options: { userId: string; reason?: string }) =>
      adminService.rejectUser(options.userId, { reason: options.reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
  });
}

export function useSendOtpMutation() {
  return useMutation({
    mutationFn: (phone: string) => authService.sendOtp({ phone }),
  });
}

export function useVerifyOtpMutation() {
  return useMutation({
    mutationFn: (options: { phone: string; otp: string }) =>
      authService.verifyOtp({ phone: options.phone, otp: options.otp }),
  });
}

export function useMeQuery(enabled: boolean) {
  return useQuery({
    queryKey: AUTH_QUERY_KEYS.me,
    queryFn: () => authService.getMe(),
    enabled,
    staleTime: APP_CONSTANTS.staleTimeMs,
  });
}

export function getPendingQueryForRole(role: Role): ListUsersQuery {
  return {
    role,
    isApproved: false,
    page: 1,
    limit: APP_CONSTANTS.defaultPageSize,
  };
}
