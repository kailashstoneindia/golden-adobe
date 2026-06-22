import * as SecureStore from 'expo-secure-store';

import { STORAGE_KEYS } from '../constants';

/**
 * Persists the long-lived refresh token in the device keychain.
 * Access tokens stay in memory only (see auth store).
 */
export const tokenManager = {
  getRefreshToken(): Promise<string | null> {
    return SecureStore.getItemAsync(STORAGE_KEYS.refreshToken);
  },

  setRefreshToken(token: string): Promise<void> {
    return SecureStore.setItemAsync(STORAGE_KEYS.refreshToken, token);
  },

  clearRefreshToken(): Promise<void> {
    return SecureStore.deleteItemAsync(STORAGE_KEYS.refreshToken);
  },
};
