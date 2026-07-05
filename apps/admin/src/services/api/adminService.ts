import type {
  AdminDashboardStats,
  ListUsersQuery,
  PaginatedUsersResponse,
  RejectUserRequest,
  UserDto,
} from '@golden-abode/types';

import { API_ENDPOINTS } from '@/constants/apiEndpoints';
import { getRequest, patchRequest } from '@/services/api/apiClient';

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

  fetchUserById(userId: string): Promise<UserDto> {
    return getRequest<UserDto>(API_ENDPOINTS.admin.userById(userId));
  },

  approveUser(userId: string): Promise<UserDto> {
    return patchRequest<UserDto, Record<string, never>>(
      API_ENDPOINTS.admin.approveUser(userId),
    );
  },

  rejectUser(userId: string, body: RejectUserRequest): Promise<UserDto> {
    return patchRequest<UserDto, RejectUserRequest>(
      API_ENDPOINTS.admin.rejectUser(userId),
      body,
    );
  },
};
