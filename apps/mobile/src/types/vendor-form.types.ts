export type VendorAccountDetailsFormValues = {
  accountHolderName: string;
  bankName: string;
  ifscCode: string;
  branchName: string;
  accountNumber: string;
};

export type VendorOnboardFormValues = {
  shopName: string;
  address: string;
  upiId: string;
  gstin: string;
  accountDetails: VendorAccountDetailsFormValues;
};

export type ShopCoordinates = {
  latitude: number;
  longitude: number;
};

export type VendorOnboardValidationResult = {
  isValid: boolean;
  errorMessage: string | null;
};
