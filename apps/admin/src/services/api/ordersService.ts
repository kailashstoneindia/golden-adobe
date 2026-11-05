import type {
  AdminOverrideVendorGroupStatusRequest,
  AdminRefundRequest,
  AdminOrderDto,
  OrderVendorGroupDto,
  PaymentEventDto,
  AdminRefundRowDto,
} from '@golden-abode/types';

import { API_ENDPOINTS } from '@/constants/apiEndpoints';
import { getRequest, patchRequest, postRequestWithStatus } from '@/services/api/apiClient';

export const ordersService = {
  // customerId: only that customer's orders (decision 0058 Task 7).
  fetchOrders(customerId?: string | null): Promise<AdminOrderDto[]> {
    const suffix = customerId ? `?customerId=${encodeURIComponent(customerId)}` : '';
    return getRequest<AdminOrderDto[]>(`${API_ENDPOINTS.admin.orders}${suffix}`);
  },

  fetchOrder(orderId: string): Promise<AdminOrderDto> {
    return getRequest<AdminOrderDto>(API_ENDPOINTS.admin.orderById(orderId));
  },

  // 202 means the refund is recorded but Razorpay has not confirmed it yet.
  async refundOrder(
    orderId: string,
    body: AdminRefundRequest,
  ): Promise<{ order: AdminOrderDto; pending: boolean }> {
    const { data, status } = await postRequestWithStatus<AdminOrderDto, AdminRefundRequest>(
      API_ENDPOINTS.admin.orderRefund(orderId),
      body,
    );
    return { order: data, pending: status === 202 };
  },

  listRefunds(orderId: string): Promise<AdminRefundRowDto[]> {
    return getRequest<AdminRefundRowDto[]>(API_ENDPOINTS.admin.orderRefunds(orderId));
  },

  cancelOrder(orderId: string): Promise<AdminOrderDto> {
    return patchRequest<AdminOrderDto, Record<string, never>>(
      API_ENDPOINTS.admin.orderCancel(orderId),
    );
  },

  fetchPaymentEvents(orderId: string): Promise<PaymentEventDto[]> {
    return getRequest<PaymentEventDto[]>(API_ENDPOINTS.admin.orderPaymentEvents(orderId));
  },

  overrideVendorGroupStatus(
    groupId: string,
    body: AdminOverrideVendorGroupStatusRequest,
  ): Promise<OrderVendorGroupDto> {
    return patchRequest<OrderVendorGroupDto, AdminOverrideVendorGroupStatusRequest>(
      API_ENDPOINTS.admin.overrideVendorGroupStatus(groupId),
      body,
    );
  },
};
