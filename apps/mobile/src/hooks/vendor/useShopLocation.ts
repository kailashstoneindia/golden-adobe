import { useState } from 'react';

import { ERROR_MESSAGES } from '../../constants';
import {
  captureCurrentShopLocation,
  describeShopLocation,
  searchShopLocationByAddress,
  ShopLocationNativeError,
} from '../../services/location';
import type { ShopCoordinates } from '../../types';

type ShopLocationState = {
  coordinates: ShopCoordinates | null;
  /** Readable address of the pinned point, when the platform can resolve one. */
  matchedAddress: string | null;
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
  const [matchedAddress, setMatchedAddress] = useState<string | null>(null);

  const pin = async (next: ShopCoordinates): Promise<void> => {
    setCoordinates(next);
    setMatchedAddress(null);
    setMatchedAddress(await describeShopLocation(next));
  };
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
      await pin(searchedCoordinates);
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
      await pin(captured);
    } catch (error) {
      setLocationError(resolveLocationErrorMessage(error));
    } finally {
      setIsLoadingLocation(false);
    }
  };

  return {
    coordinates,
    matchedAddress,
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

  if (error.message === 'LOCATION_GEOCODER_UNAVAILABLE') {
    return ERROR_MESSAGES.locationGeocoderUnavailable;
  }

  if (error.message === 'LOCATION_SEARCH_FAILED') {
    return ERROR_MESSAGES.locationSearchFailed;
  }

  return ERROR_MESSAGES.locationRequired;
}
