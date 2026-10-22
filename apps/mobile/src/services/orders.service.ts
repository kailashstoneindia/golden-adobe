import type {
  CheckoutRequest,
  OrderDto,
  OrderVendorGroupStatus,
  VendorOrderGroupDto,
} from '@golden-abode/types';

import { apiClient } from '../api/client';
import { API_ENDPOINTS } from '../constants';

export const ordersService = {
  checkout(body: CheckoutRequest): Promise<OrderDto> {
    return apiClient.post<OrderDto>(API_ENDPOINTS.checkout, body);
  },

  fetchOrders(): Promise<OrderDto[]> {
    return apiClient.get<OrderDto[]>(API_ENDPOINTS.orders.list);
  },

  fetchOrder(orderId: string): Promise<OrderDto> {
    return apiClient.get<OrderDto>(API_ENDPOINTS.orders.byId(orderId));
  },

  cancelOrder(orderId: string): Promise<OrderDto> {
    return apiClient.patch<OrderDto>(API_ENDPOINTS.orders.cancel(orderId));
  },

  fetchVendorOrderGroups(): Promise<VendorOrderGroupDto[]> {
    return apiClient.get<VendorOrderGroupDto[]>(API_ENDPOINTS.vendors.orderGroups);
  },

  fetchVendorOrderGroup(groupId: string): Promise<VendorOrderGroupDto> {
    return apiClient.get<VendorOrderGroupDto>(API_ENDPOINTS.vendors.orderGroupById(groupId));
  },

  updateVendorOrderGroupStatus(
    groupId: string,
    status: OrderVendorGroupStatus,
  ): Promise<VendorOrderGroupDto> {
    return apiClient.patch<VendorOrderGroupDto>(API_ENDPOINTS.vendors.orderGroupStatus(groupId), {
      status,
    });
  },
};
