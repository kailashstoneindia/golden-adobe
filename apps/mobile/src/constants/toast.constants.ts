export const TOAST_CONSTANTS = {
  defaultDurationMs: 2800,
  errorDurationMs: 3600,
  animationMs: 220,
} as const;

export const TOAST_MESSAGES = {
  quantityUpdated: 'Quantity has been updated',
  listingStatusUpdated: 'Listing status has been updated',
  invalidStockQuantity: 'Enter a valid stock quantity (0 or more)',
  paintHasNoStock: 'Paint listings have no countable stock',
  catalogExportReady: 'Catalog sheet is ready to save',
  catalogUploadSuccess: 'Catalog uploaded successfully',
  catalogSelectCategory: 'Select at least one category to export',
  matchConfirmed: 'Match confirmed',
  matchRejected: 'Match rejected',
  matchCandidateChosen: 'Alternative product selected',
  locationSaved: 'Search location saved',
  locationSaveFailed: 'Could not save your location',
  logoutSuccess: 'Signed out successfully',
} as const;
