import type {
  AdminDashboardStats,
  ListUsersQuery,
  AdminUserDetailDto,
  AdminUserDto,
  PaginatedUsersResponse,
  RejectUserRequest,
  SetUserActiveRequest,
  UpdateAdminUserRequest,
} from '@golden-abode/types';

import { API_ENDPOINTS } from '@/constants/apiEndpoints';
import { getRequest, patchRequest, postRequest } from '@/services/api/apiClient';

function buildUsersQueryString(query: ListUsersQuery): string {
  const params = new URLSearchParams();
  if (query.role) params.set('role', query.role);
  if (query.isApproved !== undefined) params.set('isApproved', String(query.isApproved));
  if (query.isActive !== undefined) params.set('isActive', String(query.isActive));
  if (query.search) params.set('search', query.search);
  if (query.page) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));
  const queryString = params.toString();
  return queryString ? `?${queryString}` : '';
}

export const adminService = {
  fetchStats(): Promise<AdminDashboardStats> {
    return getRequest<AdminDashboardStats>(API_ENDPOINTS.admin.stats);
  },

  fetchUsers(query: ListUsersQuery): Promise<PaginatedUsersResponse> {
    const suffix = buildUsersQueryString(query);
    return getRequest<PaginatedUsersResponse>(`${API_ENDPOINTS.admin.users}${suffix}`);
  },

  fetchUserById(userId: string): Promise<AdminUserDetailDto> {
    return getRequest<AdminUserDetailDto>(API_ENDPOINTS.admin.userById(userId));
  },

  approveUser(userId: string): Promise<AdminUserDto> {
    return patchRequest<AdminUserDto, Record<string, never>>(
      API_ENDPOINTS.admin.approveUser(userId),
    );
  },

  // Decision 0058 Task 9. Each answers with the refreshed admin detail.
  updateUser(userId: string, body: UpdateAdminUserRequest): Promise<AdminUserDetailDto> {
    return patchRequest<AdminUserDetailDto, UpdateAdminUserRequest>(
      API_ENDPOINTS.admin.userById(userId),
      body,
    );
  },

  setUserActive(userId: string, isActive: boolean): Promise<AdminUserDetailDto> {
    return patchRequest<AdminUserDetailDto, SetUserActiveRequest>(
      API_ENDPOINTS.admin.userActive(userId),
      { isActive },
    );
  },

  revokeUserSessions(userId: string): Promise<AdminUserDetailDto> {
    return postRequest<AdminUserDetailDto, Record<string, never>>(
      API_ENDPOINTS.admin.userRevokeSessions(userId),
      {},
    );
  },

  rejectUser(userId: string, body: RejectUserRequest): Promise<AdminUserDto> {
    return patchRequest<AdminUserDto, RejectUserRequest>(
      API_ENDPOINTS.admin.rejectUser(userId),
      body,
    );
  },
};
