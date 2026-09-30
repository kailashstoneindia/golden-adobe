/** SecureStore / AsyncStorage key names — single source of truth. */
export const STORAGE_KEYS = {
  refreshToken: 'ga_refresh_token',
  // Non-sensitive; SecureStore used until AsyncStorage is added as a dependency.
  customerLocationPreference: 'ga_customer_location_preference',
} as const;
