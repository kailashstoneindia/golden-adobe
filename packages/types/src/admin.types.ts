import { Role } from './role.enum';
import { UserDto } from './user.types';
import { PaginatedResponse } from './pagination.types';

export type AdminDashboardStats = {
  pendingVendors: number;
  pendingArtisans: number;
  totalUsers: number;
  approvedVendors: number;
  approvedArtisans: number;
};

export type ListUsersQuery = {
  role?: Role;
  isApproved?: boolean;
  isActive?: boolean;
  search?: string;
  page?: number;
  limit?: number;
};

export type PaginatedUsersResponse = PaginatedResponse<UserDto>;

export type RejectUserRequest = {
  reason?: string;
};

export type AdminActionResponse = {
  message: string;
  user: UserDto;
};
