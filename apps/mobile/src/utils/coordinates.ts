import type { ShopCoordinates } from '../types';

export function parseManualCoordinates(
  latitudeText: string,
  longitudeText: string,
): ShopCoordinates | null {
  const latitude = Number.parseFloat(latitudeText.trim());
  const longitude = Number.parseFloat(longitudeText.trim());

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }

  return { latitude, longitude };
}
