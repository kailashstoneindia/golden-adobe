import { Platform } from 'react-native';

import type { ShopCoordinates } from '../../types';

type LocationModule = typeof import('expo-location');

export class ShopLocationNativeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShopLocationNativeError';
  }
}

async function loadLocationModule(): Promise<LocationModule> {
  try {
    return await import('expo-location');
  } catch {
    throw new ShopLocationNativeError('LOCATION_NATIVE_MODULE_MISSING');
  }
}

export async function captureCurrentShopLocation(): Promise<ShopCoordinates> {
  const Location = await loadLocationModule();
  const permission = await Location.requestForegroundPermissionsAsync();

  if (!permission.granted) {
    throw new ShopLocationNativeError('LOCATION_PERMISSION_DENIED');
  }

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  };
}

// Shops are all in India; without the country the platform geocoder can
// match a same-named place abroad.
function withCountry(address: string): string {
  const trimmed = address.trim();
  return /\bindia\b/i.test(trimmed) ? trimmed : `${trimmed}, India`;
}

export async function searchShopLocationByAddress(address: string): Promise<ShopCoordinates> {
  const Location = await loadLocationModule();
  // Android's Geocoder requires location permission; iOS geocodes without it
  // (expo-location 56 docs), so don't prompt iOS users for nothing.
  if (Platform.OS === 'android') {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      throw new ShopLocationNativeError('LOCATION_PERMISSION_DENIED');
    }
  }

  let locations: Awaited<ReturnType<LocationModule['geocodeAsync']>>;
  try {
    locations = await Location.geocodeAsync(withCountry(address));
  } catch {
    // Thrown when the phone has no geocoder backend (some Android builds
    // without Google services) or the platform service is unreachable;
    // "no match" comes back as an empty array instead.
    throw new ShopLocationNativeError('LOCATION_GEOCODER_UNAVAILABLE');
  }
  const firstLocation = locations[0];
  if (!firstLocation) {
    throw new ShopLocationNativeError('LOCATION_SEARCH_FAILED');
  }

  return {
    latitude: firstLocation.latitude,
    longitude: firstLocation.longitude,
  };
}

/**
 * Best-effort readable address for a pinned point, so the vendor can see
 * what was matched. Returns null rather than failing the pin.
 */
export async function describeShopLocation(coordinates: ShopCoordinates): Promise<string | null> {
  try {
    const Location = await loadLocationModule();
    const [place] = await Location.reverseGeocodeAsync(coordinates);
    if (!place) {
      return null;
    }
    const parts = [place.name, place.district ?? place.subregion, place.city, place.postalCode];
    const unique = parts.filter(
      (part, index): part is string => Boolean(part) && parts.indexOf(part) === index,
    );
    return unique.length > 0 ? unique.join(', ') : null;
  } catch {
    return null;
  }
}
