import type { AddCartItemRequest, CartDto, UpdateCartItemRequest } from '@golden-abode/types';

import { apiClient } from '../api/client';
import { API_ENDPOINTS } from '../constants';

export const cartService = {
  fetchCart(): Promise<CartDto> {
    return apiClient.get<CartDto>(API_ENDPOINTS.cart.root);
  },

  addItem(body: AddCartItemRequest): Promise<CartDto> {
    return apiClient.post<CartDto>(API_ENDPOINTS.cart.items, body);
  },

  updateItem(itemId: string, body: UpdateCartItemRequest): Promise<CartDto> {
    return apiClient.patch<CartDto>(API_ENDPOINTS.cart.itemById(itemId), body);
  },

  removeItem(itemId: string): Promise<CartDto> {
    return apiClient.delete<CartDto>(API_ENDPOINTS.cart.itemById(itemId));
  },
};
