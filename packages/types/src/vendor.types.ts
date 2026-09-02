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
