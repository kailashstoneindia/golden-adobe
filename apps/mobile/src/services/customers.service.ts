import type { CustomerAddressDto, UpsertCustomerAddressRequest } from '@golden-abode/types';

import { apiClient } from '../api/client';
import { API_ENDPOINTS } from '../constants';

export const customersService = {
  fetchAddresses(): Promise<CustomerAddressDto[]> {
    return apiClient.get<CustomerAddressDto[]>(API_ENDPOINTS.customers.addresses);
  },

  addAddress(body: UpsertCustomerAddressRequest): Promise<CustomerAddressDto> {
    return apiClient.post<CustomerAddressDto>(API_ENDPOINTS.customers.addresses, body);
  },

  updateAddress(
    addressId: string,
    body: UpsertCustomerAddressRequest,
  ): Promise<CustomerAddressDto> {
    return apiClient.patch<CustomerAddressDto>(
      API_ENDPOINTS.customers.addressById(addressId),
      body,
    );
  },

  deleteAddress(addressId: string): Promise<void> {
    return apiClient.delete<void>(API_ENDPOINTS.customers.addressById(addressId));
  },
};
