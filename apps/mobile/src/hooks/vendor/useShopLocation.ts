import { useState } from 'react';
import * as Location from 'expo-location';

import { ERROR_MESSAGES } from '../../constants';
import type { ShopCoordinates } from '../../types';

type ShopLocationState = {
  coordinates: ShopCoordinates | null;
  locationError: string | null;
  isLoadingLocation: boolean;
  captureLocation: () => Promise<void>;
  clearLocationError: () => void;
};

export function useShopLocation(): ShopLocationState {
  const [coordinates, setCoordinates] = useState<ShopCoordinates | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);

  const clearLocationError = (): void => {
    setLocationError(null);
  };

  const captureLocation = async (): Promise<void> => {
    setIsLoadingLocation(true);
    setLocationError(null);

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setLocationError(ERROR_MESSAGES.locationPermissionDenied);
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      setCoordinates({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
    } catch {
      setLocationError(ERROR_MESSAGES.locationRequired);
    } finally {
      setIsLoadingLocation(false);
    }
  };

  return {
    coordinates,
    locationError,
    isLoadingLocation,
    captureLocation,
    clearLocationError,
  };
}
