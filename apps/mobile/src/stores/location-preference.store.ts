import { create } from 'zustand';

import { customerLocationStorage } from '../services/storage';
import type { CustomerLocationPreference, CustomerLocationSource } from '../types';

type LocationPreferenceState = {
  preference: CustomerLocationPreference;
  isHydrated: boolean;
  hydratePreference: () => Promise<void>;
  setPincode: (pincode: string) => Promise<void>;
  setCoordinates: (options: { latitude: number; longitude: number; pincode?: string }) => Promise<void>;
  clearPreference: () => Promise<void>;
};

const EMPTY_PREFERENCE: CustomerLocationPreference = {
  pincode: null,
  latitude: null,
  longitude: null,
  source: null,
};

async function persistPreference(preference: CustomerLocationPreference): Promise<void> {
  await customerLocationStorage.writePreference(preference);
}

export const useLocationPreferenceStore = create<LocationPreferenceState>((set) => ({
  preference: EMPTY_PREFERENCE,
  isHydrated: false,

  hydratePreference: async () => {
    const preference = await customerLocationStorage.readPreference();
    set({ preference, isHydrated: true });
  },

  setPincode: async (pincode: string) => {
    const preference: CustomerLocationPreference = {
      pincode,
      latitude: null,
      longitude: null,
      source: 'pincode',
    };
    await persistPreference(preference);
    set({ preference });
  },

  setCoordinates: async (options) => {
    const source: CustomerLocationSource = 'coordinates';
    const preference: CustomerLocationPreference = {
      pincode: options.pincode ?? null,
      latitude: options.latitude,
      longitude: options.longitude,
      source,
    };
    await persistPreference(preference);
    set({ preference });
  },

  clearPreference: async () => {
    await customerLocationStorage.clearPreference();
    set({ preference: EMPTY_PREFERENCE });
  },
}));

export function selectHasSearchLocation(state: LocationPreferenceState): boolean {
  const { preference } = state;
  if (preference.pincode) {
    return true;
  }
  return preference.latitude !== null && preference.longitude !== null;
}
