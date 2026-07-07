import { useState } from 'react';

import { ERROR_MESSAGES } from '../../constants';
import {
  captureCurrentShopLocation,
  ShopLocationNativeError,
} from '../../services/location';
import type { ShopCoordinates } from '../../types';
import { parseManualCoordinates } from '../../utils/coordinates';

type ShopLocationState = {
  coordinates: ShopCoordinates | null;
  manualLatitude: string;
  manualLongitude: string;
  locationError: string | null;
  isLoadingLocation: boolean;
  captureLocation: () => Promise<void>;
  updateManualLatitude: (value: string) => void;
  updateManualLongitude: (value: string) => void;
  applyManualCoordinates: () => boolean;
};

export function useShopLocation(): ShopLocationState {
  const [coordinates, setCoordinates] = useState<ShopCoordinates | null>(null);
  const [manualLatitude, setManualLatitude] = useState('');
  const [manualLongitude, setManualLongitude] = useState('');
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);

  const updateManualLatitude = (value: string): void => {
    setManualLatitude(value);
    setLocationError(null);
  };

  const updateManualLongitude = (value: string): void => {
    setManualLongitude(value);
    setLocationError(null);
  };

  const applyManualCoordinates = (): boolean => {
    const parsed = parseManualCoordinates(manualLatitude, manualLongitude);
    if (!parsed) {
      setLocationError(ERROR_MESSAGES.invalidCoordinates);
      return false;
    }

    setCoordinates(parsed);
    setLocationError(null);
    return true;
  };

  const captureLocation = async (): Promise<void> => {
    setIsLoadingLocation(true);
    setLocationError(null);

    try {
      const captured = await captureCurrentShopLocation();
      setCoordinates(captured);
      setManualLatitude(String(captured.latitude));
      setManualLongitude(String(captured.longitude));
    } catch (error) {
      setLocationError(resolveLocationErrorMessage(error));
    } finally {
      setIsLoadingLocation(false);
    }
  };

  return {
    coordinates,
    manualLatitude,
    manualLongitude,
    locationError,
    isLoadingLocation,
    captureLocation,
    updateManualLatitude,
    updateManualLongitude,
    applyManualCoordinates,
  };
}

function resolveLocationErrorMessage(error: unknown): string {
  if (!(error instanceof ShopLocationNativeError)) {
    return ERROR_MESSAGES.locationRequired;
  }

  if (error.message === 'LOCATION_PERMISSION_DENIED') {
    return ERROR_MESSAGES.locationPermissionDenied;
  }

  if (error.message === 'LOCATION_NATIVE_MODULE_MISSING') {
    return ERROR_MESSAGES.locationNativeModuleMissing;
  }

  return ERROR_MESSAGES.locationRequired;
}
