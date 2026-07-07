export const ERROR_MESSAGES = {
  generic: 'Something went wrong. Please try again.',
  shopNameRequired: 'Enter your shop or business name.',
  addressRequired: 'Enter your shop address.',
  locationRequired: 'Capture your shop location before continuing.',
  locationPermissionDenied: 'Location permission is required to pin your shop.',
  locationNativeModuleMissing:
    'GPS is unavailable in this build. Enter latitude and longitude manually, or rebuild the app after prebuild.',
  invalidCoordinates: 'Enter valid latitude (-90 to 90) and longitude (-180 to 180).',
  gstinLength: 'GSTIN must be exactly 15 characters.',
  vendorOnboardFailed: 'Could not save your shop profile. Try again.',
} as const;
