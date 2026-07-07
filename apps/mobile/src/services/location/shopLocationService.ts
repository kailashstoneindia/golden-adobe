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
