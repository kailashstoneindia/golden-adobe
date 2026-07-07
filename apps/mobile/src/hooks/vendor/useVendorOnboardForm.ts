import { useState } from 'react';

import { ERROR_MESSAGES } from '../../constants';
import type { ShopCoordinates, VendorOnboardFormValues } from '../../types';
import { buildVendorOnboardPayload, validateVendorOnboardForm } from '../../utils/vendor';
import { getVendorOnboardErrorMessage, useVendorOnboard } from './useVendorOnboard';

const INITIAL_FORM_VALUES: VendorOnboardFormValues = {
  shopName: '',
  address: '',
  upiId: '',
  bankDetails: '',
  gstin: '',
};

type VendorOnboardFormState = {
  formValues: VendorOnboardFormValues;
  errorMessage: string | null;
  isSubmitting: boolean;
  updateField: (field: keyof VendorOnboardFormValues, value: string) => void;
  handleSubmit: (coordinates: ShopCoordinates | null) => void;
};

export function useVendorOnboardForm(): VendorOnboardFormState {
  const [formValues, setFormValues] = useState<VendorOnboardFormValues>(INITIAL_FORM_VALUES);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const vendorOnboard = useVendorOnboard();

  const updateField = (field: keyof VendorOnboardFormValues, value: string): void => {
    setFormValues((currentValues) => ({ ...currentValues, [field]: value }));
    setErrorMessage(null);
  };

  const handleSubmit = (coordinates: ShopCoordinates | null): void => {
    const validation = validateVendorOnboardForm(formValues, coordinates);
    if (!validation.isValid || !coordinates) {
      setErrorMessage(validation.errorMessage ?? ERROR_MESSAGES.locationRequired);
      return;
    }

    const payload = buildVendorOnboardPayload(formValues, coordinates);
    vendorOnboard.mutate(payload, {
      onError: (error) => {
        setErrorMessage(getVendorOnboardErrorMessage(error));
      },
    });
  };

  return {
    formValues,
    errorMessage,
    isSubmitting: vendorOnboard.isPending,
    updateField,
    handleSubmit,
  };
}
