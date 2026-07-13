export const ERROR_MESSAGES = {
  generic: 'Something went wrong. Please try again.',
  shopNameRequired: 'Enter your shop or business name.',
  addressRequired: 'Enter your shop address.',
  locationRequired: 'Capture your shop location before continuing.',
  locationPermissionDenied: 'Location permission is required to pin your shop.',
  locationNativeModuleMissing:
    'GPS is unavailable in this build. Rebuild the app after prebuild.',
  locationSearchRequired: 'Enter your shop area or address to search.',
  locationSearchFailed: 'Location not found. Try a more specific address.',
  invalidCoordinates: 'Enter valid latitude (-90 to 90) and longitude (-180 to 180).',
  gstinLength: 'GSTIN must be exactly 15 characters.',
  accountHolderNameRequired: 'Enter the account holder name.',
  bankNameRequired: 'Select a bank name.',
  ifscCodeInvalid: 'Enter a valid 11-character IFSC code.',
  branchNameRequired: 'Enter the branch name.',
  accountNumberInvalid: 'Enter a valid account number.',
  vendorOnboardFailed: 'Could not save your shop profile. Try again.',
} as const;
