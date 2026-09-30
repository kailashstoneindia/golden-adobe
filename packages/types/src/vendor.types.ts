export interface VendorAccountDetailsDto {
  id: string;
  vendorId: string;
  accountHolderName: string;
  bankName: string;
  ifscCode: string;
  branchName: string;
  accountNumber: string;
  createdAt: string;
  updatedAt: string;
}

export interface VendorAccountDetailsInputDto {
  accountHolderName: string;
  bankName: string;
  ifscCode: string;
  branchName: string;
  accountNumber: string;
}

export interface VendorCityDto {
  id: string;
  name: string;
}

export interface VendorProfileDto {
  id: string;
  userId: string;
  shopName: string;
  address: string;
  latitude: number;
  longitude: number;
  upiId: string | null;
  bankDetails: string | null;
  accountDetails: VendorAccountDetailsDto | null;
  gstin: string | null;
  // Decision 0018 — one vendor, one city. Null until resolved from
  // lat/lng at onboarding or set by an admin override; rows predating
  // the column stay null until the backfill runs.
  cityId: string | null;
  city: VendorCityDto | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateVendorProfileDto {
  shopName?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  upiId?: string;
  bankDetails?: string;
  gstin?: string;
}

export interface VendorCategoryDto {
  categoryId: string;
  name: string;
  path: string;
  level: number;
}

export interface VendorOnboardDto {
  shopName: string;
  address: string;
  latitude: number;
  longitude: number;
  upiId?: string;
  bankDetails?: string;
  accountDetails: VendorAccountDetailsInputDto;
  gstin?: string;
}

export interface UpdateVendorOnboardingProgressDto {
  onboardingStage: import('./user.types').VendorOnboardingStage;
}

// ---------------------------------------------------------------------
// Vendor stock management (workstream 4)
//
// Stock and status are INDEPENDENT. Setting stock never writes `status`,
// and setting status never writes stock — so `quantityAvailable: 0` with
// `status: 'active'` is a legal, reachable state that the vendor alone
// resolves. The alternative (auto-flipping status on zero stock) was
// rejected: it writes a column the vendor did not ask to change, and
// "restore to active when stock returns" guesses wrongly for a listing
// that was paused deliberately.
//
// Paint (sale_unit_type = 'tinted_to_order') has no inventory row at all
// per decision 0007 — nothing is countable there — so `quantityAvailable`
// is null for paint listings and availability comes from `status`.
// ---------------------------------------------------------------------

export type VendorListingStockDto = {
  vendorListingId: string;
  masterProductId: string;
  productName: string;
  productCode: string;
  vendorSku: string | null;
  statedGrade: string | null;
  price: number;
  mrp: number | null;
  status: 'active' | 'paused' | 'out_of_stock';
  // null means no inventory row exists: either paint (never gets one), or
  // a listing whose stock has never been set. Distinct from 0, which is a
  // vendor asserting "none left".
  quantityAvailable: number | null;
  // Always present so a caller can tell paint apart from "not set yet"
  // without a second lookup.
  isPaint: boolean;
  updatedAt: string;
};

export type BulkStockItem = {
  vendorListingId: string;
  quantityAvailable: number;
};

export type BulkStockResult = {
  updatedCount: number;
};

export type VendorListingStatus = VendorListingStockDto['status'];

export type ListVendorListingsQuery = {
  status?: VendorListingStatus;
  page?: number;
  limit?: number;
};

export type SetVendorStockRequest = {
  quantityAvailable: number;
};

export type SetVendorListingStatusRequest = {
  status: VendorListingStatus;
};

export type VendorCatalogExportScope = {
  leafCategoryIds: string[];
  brandIds?: string[];
  sinceDate?: string;
};

export type VendorCatalogExportCount = {
  rowCount: number;
};

export type ChoosePendingCandidateRequest = {
  masterProductId: string;
};
