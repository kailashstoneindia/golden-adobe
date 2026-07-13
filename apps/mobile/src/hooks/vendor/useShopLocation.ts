import { useState } from 'react';

import { ERROR_MESSAGES } from '../../constants';
import {
  captureCurrentShopLocation,
  searchShopLocationByAddress,
  ShopLocationNativeError,
} from '../../services/location';
import type { ShopCoordinates } from '../../types';

type ShopLocationState = {
  coordinates: ShopCoordinates | null;
  searchAddress: string;
  locationError: string | null;
  isLoadingLocation: boolean;
  isSearchingLocation: boolean;
  captureLocation: () => Promise<void>;
  searchLocation: () => Promise<void>;
  updateSearchAddress: (value: string) => void;
};

export function useShopLocation(): ShopLocationState {
  const [coordinates, setCoordinates] = useState<ShopCoordinates | null>(null);
  const [searchAddress, setSearchAddress] = useState('');
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [isSearchingLocation, setIsSearchingLocation] = useState(false);

  const updateSearchAddress = (value: string): void => {
    setSearchAddress(value);
    setLocationError(null);
  };

  const searchLocation = async (): Promise<void> => {
    const trimmedAddress = searchAddress.trim();
    if (!trimmedAddress) {
      setLocationError(ERROR_MESSAGES.locationSearchRequired);
      return;
    }

    setIsSearchingLocation(true);
    setLocationError(null);

    try {
      const searchedCoordinates = await searchShopLocationByAddress(trimmedAddress);
      setCoordinates(searchedCoordinates);
    } catch (error) {
      setLocationError(resolveLocationErrorMessage(error));
    } finally {
      setIsSearchingLocation(false);
    }
  };

  const captureLocation = async (): Promise<void> => {
    setIsLoadingLocation(true);
    setLocationError(null);

    try {
      const captured = await captureCurrentShopLocation();
      setCoordinates(captured);
    } catch (error) {
      setLocationError(resolveLocationErrorMessage(error));
    } finally {
      setIsLoadingLocation(false);
    }
  };

  return {
    coordinates,
    searchAddress,
    locationError,
    isLoadingLocation,
    isSearchingLocation,
    captureLocation,
    searchLocation,
    updateSearchAddress,
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

  if (error.message === 'LOCATION_SEARCH_FAILED') {
    return ERROR_MESSAGES.locationSearchFailed;
  }

  return ERROR_MESSAGES.locationRequired;
}
