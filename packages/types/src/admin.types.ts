import { Role } from './role.enum';
import { UserDto } from './user.types';
import { PaginatedResponse } from './pagination.types';
import type {
  ArtisanHireRequestDto,
  ArtisanProfileDto,
  ArtisanTeamMemberDto,
  TradeType,
} from './artisan.types';
import type { OrderDto, OrderVendorGroupDto, RefundDto } from './order.types';
import type { VendorProfileDto } from './vendor.types';

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

/** An order as the admin sees it (decision 0058 Task 4d): who is involved and how to reach them. */
export type AdminOrderVendorGroupDto = OrderVendorGroupDto & {
  vendor: AdminContactDto | null;
  // When the group was created and last changed (e.g. shipped, delivered).
  createdAt: string;
  updatedAt: string;
};

export type AdminOrderDto = Omit<OrderDto, 'vendorGroups'> & {
  customer: AdminContactDto | null;
  customerFullName: string | null;
  vendorGroups: AdminOrderVendorGroupDto[];
  itemCount: number;
  // The hire request this order is booked against (orders.booking_id), if any.
  hireRequestId: string | null;
};

export type AdminRefundRowDto = RefundDto & {
  createdByName: string | null;
  payoutReference: string | null;
  razorpayPaymentId: string | null;
  // Spots a refund stuck in "requested".
  updatedAt: string;
};

// ─── Vendors (decision 0058 Task 5) ──────────────────────────────────────

export type AdminWarehouseDto = {
  id: string;
  name: string;
  address: string | null;
  isActive: boolean;
};

export type AdminVendorDto = VendorProfileDto & {
  owner: AdminContactDto | null;
  // How the city was set: 'gps' (from the address) or 'admin' (pinned); null if unset.
  citySource: string | null;
  categoryCount: number;
  listingCounts: { active: number; paused: number; outOfStock: number };
  // Listing flags not yet resolved (vendor_listing_flag.resolved_at IS NULL).
  openFlagCount: number;
  orderGroupCount: number;
  warehouses: AdminWarehouseDto[];
};

export type AdminVendorListingDto = {
  id: string;
  masterProductId: string;
  productName: string;
  productCode: string | null;
  vendorSku: string | null;
  price: number;
  mrp: number | null;
  minOrderQty: number | null;
  statedGrade: string | null;
  status: 'active' | 'paused' | 'out_of_stock';
  quantityAvailable: number | null;
  quantityReserved: number | null;
  supportsTinting: boolean;
  saleUnitType: string | null;
  // The product's unit of measure (unit_of_measure.name), e.g. "Square Foot",
  // so stock reads as "40 Square Foot", not just 40. Null when not set.
  unit: string | null;
  openFlags: { reason: string; flaggedAt: string }[];
  createdAt: string;
  updatedAt: string;
  // When the stock row last changed; null when there is no stock row.
  stockUpdatedAt: string | null;
};

export type PaginatedAdminVendorListingsResponse = PaginatedResponse<AdminVendorListingDto>;

// ─── Ustaads (decision 0058 Task 6) ──────────────────────────────────────

export type AdminArtisanTeamMemberDto = ArtisanTeamMemberDto & {
  // Short-lived signed link to the member's document; null in lists.
  documentViewUrl: string | null;
};

export type AdminArtisanDto = Omit<ArtisanProfileDto, 'team'> & {
  owner: AdminContactDto | null;
  team: AdminArtisanTeamMemberDto[];
  // Short-lived signed link to the ustaad's document; null in lists and when
  // there is no document. A stored http(s) URL is passed through as-is.
  documentViewUrl: string | null;
  jobCounts: { active: number; completed: number; declined: number; total: number };
  // False when links could not be signed (e.g. no media bucket configured):
  // a document may exist even though there is no link to it.
  documentStorageAvailable: boolean;
};

export type PaginatedAdminArtisansResponse = PaginatedResponse<AdminArtisanDto>;
