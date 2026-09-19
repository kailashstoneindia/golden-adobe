import * as SecureStore from 'expo-secure-store';

import { STORAGE_KEYS } from '../../constants';
import type { CustomerLocationPreference } from '../../types';

const EMPTY_PREFERENCE: CustomerLocationPreference = {
  pincode: null,
  latitude: null,
  longitude: null,
  source: null,
};

function isLocationPreference(value: unknown): value is CustomerLocationPreference {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    'pincode' in candidate &&
    'latitude' in candidate &&
    'longitude' in candidate &&
    'source' in candidate
  );
}

export const customerLocationStorage = {
  async readPreference(): Promise<CustomerLocationPreference> {
    const rawValue = await SecureStore.getItemAsync(STORAGE_KEYS.customerLocationPreference);
    if (!rawValue) {
      return EMPTY_PREFERENCE;
    }

    try {
      const parsed: unknown = JSON.parse(rawValue);
      if (!isLocationPreference(parsed)) {
        return EMPTY_PREFERENCE;
      }
      return parsed;
    } catch {
      return EMPTY_PREFERENCE;
    }
  },

  async writePreference(preference: CustomerLocationPreference): Promise<void> {
    await SecureStore.setItemAsync(
      STORAGE_KEYS.customerLocationPreference,
      JSON.stringify(preference),
    );
  },

  async clearPreference(): Promise<void> {
    await SecureStore.deleteItemAsync(STORAGE_KEYS.customerLocationPreference);
  },
};
