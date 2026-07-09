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

export async function searchShopLocationByAddress(address: string): Promise<ShopCoordinates> {
  const Location = await loadLocationModule();
  const permission = await Location.requestForegroundPermissionsAsync();

  if (!permission.granted) {
    throw new ShopLocationNativeError('LOCATION_PERMISSION_DENIED');
  }

  const locations = await Location.geocodeAsync(address.trim());
  const firstLocation = locations[0];
  if (!firstLocation) {
    throw new ShopLocationNativeError('LOCATION_SEARCH_FAILED');
  }

  return {
    latitude: firstLocation.latitude,
    longitude: firstLocation.longitude,
  };
}
