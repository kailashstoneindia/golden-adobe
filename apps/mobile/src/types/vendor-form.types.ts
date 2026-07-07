export type VendorOnboardFormValues = {
  shopName: string;
  address: string;
  upiId: string;
  bankDetails: string;
  gstin: string;
};

export type ShopCoordinates = {
  latitude: number;
  longitude: number;
};

export type VendorOnboardValidationResult = {
  isValid: boolean;
  errorMessage: string | null;
};
