import type {
  AdminOverrideVendorGroupStatusRequest,
  AdminRefundRequest,
  OrderDto,
  PaymentEventDto,
  RefundDto,
} from '@golden-abode/types';

import { API_ENDPOINTS } from '@/constants/apiEndpoints';
import { getRequest, patchRequest, postRequestWithStatus } from '@/services/api/apiClient';

export const ordersService = {
  fetchOrders(): Promise<OrderDto[]> {
    return getRequest<OrderDto[]>(API_ENDPOINTS.admin.orders);
  },

  fetchOrder(orderId: string): Promise<OrderDto> {
    return getRequest<OrderDto>(API_ENDPOINTS.admin.orderById(orderId));
  },

  // 202 means the refund is recorded but Razorpay has not confirmed it yet.
  async refundOrder(
    orderId: string,
    body: AdminRefundRequest,
  ): Promise<{ order: OrderDto; pending: boolean }> {
    const { data, status } = await postRequestWithStatus<OrderDto, AdminRefundRequest>(
      API_ENDPOINTS.admin.orderRefund(orderId),
      body,
    );
    return { order: data, pending: status === 202 };
  },

  listRefunds(orderId: string): Promise<RefundDto[]> {
    return getRequest<RefundDto[]>(API_ENDPOINTS.admin.orderRefunds(orderId));
  },

  cancelOrder(orderId: string): Promise<OrderDto> {
    return patchRequest<OrderDto, Record<string, never>>(API_ENDPOINTS.admin.orderCancel(orderId));
  },

  fetchPaymentEvents(orderId: string): Promise<PaymentEventDto[]> {
    return getRequest<PaymentEventDto[]>(API_ENDPOINTS.admin.orderPaymentEvents(orderId));
  },

  overrideVendorGroupStatus(
    groupId: string,
    body: AdminOverrideVendorGroupStatusRequest,
  ): Promise<OrderDto['vendorGroups'][number]> {
    return patchRequest<OrderDto['vendorGroups'][number], AdminOverrideVendorGroupStatusRequest>(
      API_ENDPOINTS.admin.overrideVendorGroupStatus(groupId),
      body,
    );
  },
};
