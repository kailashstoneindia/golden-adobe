import { useCallback, useState } from 'react';

import { ERROR_MESSAGES } from '../../constants';
import {
  captureCurrentShopLocation,
  ShopLocationNativeError,
} from '../../services';
import { useLocationPreferenceStore } from '../../stores/location-preference.store';
import { isValidIndianPincode, sanitizePincodeDigits } from '../../utils/pincode';

export function useCustomerLocationPreference() {
  const preference = useLocationPreferenceStore((store) => store.preference);
  const isHydrated = useLocationPreferenceStore((store) => store.isHydrated);
  const hydratePreference = useLocationPreferenceStore((store) => store.hydratePreference);
  const setPincode = useLocationPreferenceStore((store) => store.setPincode);
  const setCoordinates = useLocationPreferenceStore((store) => store.setCoordinates);
  const clearPreference = useLocationPreferenceStore((store) => store.clearPreference);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSavingPincode, setIsSavingPincode] = useState(false);
  const [isCapturingGps, setIsCapturingGps] = useState(false);

  const handleHydrate = useCallback(async () => {
    await hydratePreference();
  }, [hydratePreference]);

  const handleSavePincode = useCallback(
    async (rawPincode: string) =>
      savePincodePreference({
        rawPincode,
        setPincode,
        setErrorMessage,
        setIsSavingPincode,
      }),
    [setPincode],
  );

  const handleCaptureGps = useCallback(
    async () =>
      captureGpsPreference({
        setCoordinates,
        setErrorMessage,
        setIsCapturingGps,
      }),
    [setCoordinates],
  );

  return {
    preference,
    isHydrated,
    errorMessage,
    isSavingPincode,
    isCapturingGps,
    handleHydrate,
    handleSavePincode,
    handleCaptureGps,
    clearPreference,
  };
}

type SavePincodeOptions = {
  rawPincode: string;
  setPincode: (pincode: string) => Promise<void>;
  setErrorMessage: (message: string | null) => void;
  setIsSavingPincode: (isSaving: boolean) => void;
};

async function savePincodePreference(options: SavePincodeOptions): Promise<boolean> {
  const pincode = sanitizePincodeDigits(options.rawPincode);
  if (!isValidIndianPincode(pincode)) {
    options.setErrorMessage(ERROR_MESSAGES.invalidPincode);
    return false;
  }

  options.setIsSavingPincode(true);
  options.setErrorMessage(null);
  try {
    await options.setPincode(pincode);
    return true;
  } catch {
    options.setErrorMessage(ERROR_MESSAGES.generic);
    return false;
  } finally {
    options.setIsSavingPincode(false);
  }
}

type CaptureGpsOptions = {
  setCoordinates: (options: { latitude: number; longitude: number }) => Promise<void>;
  setErrorMessage: (message: string | null) => void;
  setIsCapturingGps: (isCapturing: boolean) => void;
};

async function captureGpsPreference(options: CaptureGpsOptions): Promise<boolean> {
  options.setIsCapturingGps(true);
  options.setErrorMessage(null);
  try {
    const coordinates = await captureCurrentShopLocation();
    await options.setCoordinates(coordinates);
    return true;
  } catch (error: unknown) {
    options.setErrorMessage(resolveGpsErrorMessage(error));
    return false;
  } finally {
    options.setIsCapturingGps(false);
  }
}

function resolveGpsErrorMessage(error: unknown): string {
  if (!(error instanceof ShopLocationNativeError)) {
    return ERROR_MESSAGES.generic;
  }
  if (error.message === 'LOCATION_PERMISSION_DENIED') {
    return ERROR_MESSAGES.locationPermissionDenied;
  }
  if (error.message === 'LOCATION_NATIVE_MODULE_MISSING') {
    return ERROR_MESSAGES.locationNativeModuleMissing;
  }
  return ERROR_MESSAGES.generic;
}
