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
  createdAt: string;
  updatedAt: string;
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
