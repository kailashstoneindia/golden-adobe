export interface VendorProfileDto {
  id: string;
  userId: string;
  shopName: string;
  address: string;
  latitude: number;
  longitude: number;
  upiId: string | null;
  bankDetails: string | null;
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
  gstin?: string;
}
