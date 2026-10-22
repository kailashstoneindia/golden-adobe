import type { CustomerAddressDto, UpsertCustomerAddressRequest } from '@golden-abode/types';
import { Role } from '@golden-abode/types';
import { useCallback, useState } from 'react';

import { AddressCard, AddressForm } from '../../src/components/addresses';
import { DemoScreen } from '../../src/components/demo/DemoScreen';
import { Button, EmptyStateCard, Text } from '../../src/components/ui';
import {
  APP_CONSTANTS,
  EMPTY_STATE_MESSAGES,
  ERROR_MESSAGES,
  TOAST_MESSAGES,
} from '../../src/constants';
import { useAuth } from '../../src/hooks/auth';
import {
  useAddAddressMutation,
  useAddressesQuery,
  useDeleteAddressMutation,
  useUpdateAddressMutation,
} from '../../src/hooks/customers';
import { useToast } from '../../src/hooks/useToast';
import { Colors } from '../../src/theme';
import type { AddressFormValues } from '../../src/types';
import { getApiErrorMessage } from '../../src/utils';

const EMPTY_FORM: AddressFormValues = {
  label: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  pincode: '',
  isDefault: false,
};

export default function SavedAddressesScreen() {
  const { user } = useAuth();
  const isCustomer = user?.role === Role.CUSTOMER;
  const addressesQuery = useAddressesQuery(isCustomer);
  const addAddress = useAddAddressMutation();
  const updateAddress = useUpdateAddressMutation();
  const deleteAddress = useDeleteAddressMutation();
  const { showSuccess, showError } = useToast();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<CustomerAddressDto | null>(null);
  const [formValues, setFormValues] = useState<AddressFormValues>(EMPTY_FORM);
  const addresses = addressesQuery.data ?? [];
  const isSubmitting = addAddress.isPending || updateAddress.isPending;

  const handleChange = useCallback((field: keyof AddressFormValues, value: string | boolean) => {
    setFormValues((current) => ({ ...current, [field]: value }));
  }, []);

  const handleOpenCreate = useCallback(() => {
    setEditingAddress(null);
    setFormValues(EMPTY_FORM);
    setIsFormOpen(true);
  }, []);

  const handleOpenEdit = useCallback((address: CustomerAddressDto) => {
    setEditingAddress(address);
    setFormValues(toFormValues(address));
    setIsFormOpen(true);
  }, []);

  const handleCancel = useCallback(() => {
    setIsFormOpen(false);
    setEditingAddress(null);
  }, []);

  const handleSubmit = useCallback(() => {
    const body = toAddressRequest(formValues);
    if (!body) {
      showError(ERROR_MESSAGES.invalidPincode);
      return;
    }
    if (editingAddress) {
      updateAddress.mutate(
        { addressId: editingAddress.id, body },
        {
          onSuccess: () => {
            showSuccess(TOAST_MESSAGES.addressSaved);
            handleCancel();
          },
          onError: (error) =>
            showError(getApiErrorMessage(error, ERROR_MESSAGES.addressSaveFailed)),
        },
      );
      return;
    }
    addAddress.mutate(body, {
      onSuccess: () => {
        showSuccess(TOAST_MESSAGES.addressSaved);
        handleCancel();
      },
      onError: (error) => showError(getApiErrorMessage(error, ERROR_MESSAGES.addressSaveFailed)),
    });
  }, [addAddress, editingAddress, formValues, handleCancel, showError, showSuccess, updateAddress]);

  const handleDelete = useCallback(
    (address: CustomerAddressDto) => {
      deleteAddress.mutate(address.id, {
        onSuccess: () => showSuccess(TOAST_MESSAGES.addressDeleted),
        onError: (error) =>
          showError(getApiErrorMessage(error, ERROR_MESSAGES.addressDeleteFailed)),
      });
    },
    [deleteAddress, showError, showSuccess],
  );

  if (!isCustomer) {
    return (
      <DemoScreen title="Saved addresses" showBack>
        <EmptyStateCard title="No saved addresses" message={EMPTY_STATE_MESSAGES.addressesEmpty} />
      </DemoScreen>
    );
  }

  if (addressesQuery.isLoading) {
    return (
      <DemoScreen title="Saved addresses" showBack>
        <Text variant="body" color={Colors.inkSoft}>
          Loading addresses…
        </Text>
      </DemoScreen>
    );
  }

  if (addressesQuery.isError) {
    return (
      <DemoScreen title="Saved addresses" showBack>
        <EmptyStateCard title="Could not load addresses" message={ERROR_MESSAGES.addressesFailed} />
      </DemoScreen>
    );
  }

  return (
    <DemoScreen title="Saved addresses" subtitle="Delivery locations for checkout" showBack>
      {isFormOpen ? (
        <AddressForm
          values={formValues}
          isSubmitting={isSubmitting}
          submitLabel={editingAddress ? 'Save address' : 'Add address'}
          onChange={handleChange}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
        />
      ) : (
        <Button title="Add address" onPress={handleOpenCreate} />
      )}
      {addresses.length === 0 && !isFormOpen ? (
        <EmptyStateCard title="No saved addresses" message={EMPTY_STATE_MESSAGES.addressesEmpty} />
      ) : (
        addresses.map((address) => (
          <AddressCard
            key={address.id}
            address={address}
            onEdit={() => handleOpenEdit(address)}
            onDelete={() => handleDelete(address)}
          />
        ))
      )}
    </DemoScreen>
  );
}

function toFormValues(address: CustomerAddressDto): AddressFormValues {
  return {
    label: address.label,
    addressLine1: address.addressLine1,
    addressLine2: address.addressLine2 ?? '',
    city: address.city,
    pincode: address.pincode,
    isDefault: address.isDefault,
  };
}

function toAddressRequest(values: AddressFormValues): UpsertCustomerAddressRequest | null {
  const pincode = values.pincode.trim();
  if (pincode.length !== APP_CONSTANTS.indianPincodeLength) {
    return null;
  }
  if (!values.label.trim() || !values.addressLine1.trim() || !values.city.trim()) {
    return null;
  }
  return {
    label: values.label.trim(),
    addressLine1: values.addressLine1.trim(),
    addressLine2: values.addressLine2.trim() || undefined,
    city: values.city.trim(),
    pincode,
    isDefault: values.isDefault,
  };
}
