import { Role } from './role.enum';
import { UserDto } from './user.types';
import { PaginatedResponse } from './pagination.types';
import type { ArtisanHireRequestDto, TradeType } from './artisan.types';

export type AdminDashboardStats = {
  pendingVendors: number;
  pendingArtisans: number;
  totalUsers: number;
  approvedVendors: number;
  approvedArtisans: number;
  pendingArtisanVerifications: number;
  pendingHireRequests: number;
  // Ustaads with no profile or no document yet (decision 0058 §3a).
  artisansAwaitingDocument: number;
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

// ─── Admin-only views (decision 0058) ────────────────────────────────────
// Admin DTOs extend the shared ones; customers, vendors and ustaads never
// receive these fields.

/** Who a person is and how to reach them, as the admin sees it. */
export type AdminContactDto = {
  userId: string;
  name: string;
  phone: string | null;
  email: string | null;
  role: Role | null; // null until onboarding picks a role
  isActive: boolean;
  isApproved: boolean;
  lastLoginAt: string | null;
};

/** Hire requests show the ustaad without an email (user ruling, decision 0058). */
export type AdminContactWithoutEmailDto = Omit<AdminContactDto, 'email'>;

export type AdminHireRequestDto = ArtisanHireRequestDto & {
  customer: AdminContactDto | null;
  artisan: AdminContactWithoutEmailDto | null;
  artisanTradeType: TradeType | null;
  adminReviewerName: string | null;
  estimateCount: number;
};

export type PaginatedAdminHireRequestsResponse = PaginatedResponse<AdminHireRequestDto>;
