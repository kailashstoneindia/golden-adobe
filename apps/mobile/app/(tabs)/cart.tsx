import type { CartItemDto } from '@golden-abode/types';
import { Role } from '@golden-abode/types';
import { router } from 'expo-router';
import { useCallback, useMemo } from 'react';

import { CartVendorGroupCard, PriceSummary } from '../../src/components/cart';
import { DemoScreen } from '../../src/components/demo/DemoScreen';
import { Button, EmptyStateCard, Text } from '../../src/components/ui';
import { EMPTY_STATE_MESSAGES, ERROR_MESSAGES, ROUTES, TOAST_MESSAGES } from '../../src/constants';
import { useAuth } from '../../src/hooks/auth';
import {
  useCartQuery,
  useRemoveCartItemMutation,
  useUpdateCartItemMutation,
} from '../../src/hooks/cart';
import { useToast } from '../../src/hooks/useToast';
import { Colors } from '../../src/theme';
import {
  buildCartPriceSummary,
  getApiErrorMessage,
  groupCartItemsByShop,
  hasCartMinOrderShortfall,
  hasPaintCartItems,
  hasUnstockedCartItems,
} from '../../src/utils';

export default function CartTabScreen() {
  const { user } = useAuth();
  const isCustomer = user?.role === Role.CUSTOMER;
  const cartQuery = useCartQuery(isCustomer);
  const updateItem = useUpdateCartItemMutation();
  const removeItem = useRemoveCartItemMutation();
  const { showSuccess, showError } = useToast();
  const items = cartQuery.data?.items ?? [];
  const groups = useMemo(() => groupCartItemsByShop(items), [items]);
  const priceSummary = useMemo(() => buildCartPriceSummary(groups), [groups]);
  const isUpdating = updateItem.isPending || removeItem.isPending;
  const canCheckout =
    items.length > 0 &&
    !hasPaintCartItems(items) &&
    !hasUnstockedCartItems(items) &&
    !hasCartMinOrderShortfall(groups);

  const handleRemove = useCallback(
    (item: CartItemDto) => {
      removeItem.mutate(item.id, {
        onSuccess: () => showSuccess(TOAST_MESSAGES.itemRemovedFromCart),
        onError: (error) => showError(getApiErrorMessage(error, ERROR_MESSAGES.cartUpdateFailed)),
      });
    },
    [removeItem, showError, showSuccess],
  );

  const handleIncrease = useCallback(
    (item: CartItemDto) => {
      updateItem.mutate(
        { itemId: item.id, quantity: item.quantity + 1 },
        {
          onError: (error) => showError(getApiErrorMessage(error, ERROR_MESSAGES.cartUpdateFailed)),
        },
      );
    },
    [showError, updateItem],
  );

  const handleDecrease = useCallback(
    (item: CartItemDto) => {
      if (item.quantity <= 1) {
        handleRemove(item);
        return;
      }
      updateItem.mutate(
        { itemId: item.id, quantity: item.quantity - 1 },
        {
          onError: (error) => showError(getApiErrorMessage(error, ERROR_MESSAGES.cartUpdateFailed)),
        },
      );
    },
    [handleRemove, showError, updateItem],
  );

  if (!isCustomer) {
    return (
      <DemoScreen title="Your cart">
        <EmptyStateCard title="Cart is empty" message={EMPTY_STATE_MESSAGES.cartEmpty} />
      </DemoScreen>
    );
  }

  if (cartQuery.isLoading) {
    return (
      <DemoScreen title="Your cart">
        <Text variant="body" color={Colors.inkSoft}>
          Loading cart…
        </Text>
      </DemoScreen>
    );
  }

  if (cartQuery.isError) {
    return (
      <DemoScreen title="Your cart">
        <EmptyStateCard title="Could not load cart" message={ERROR_MESSAGES.cartFailed} />
      </DemoScreen>
    );
  }

  if (items.length === 0) {
    return (
      <DemoScreen title="Your cart">
        <EmptyStateCard title="Cart is empty" message={EMPTY_STATE_MESSAGES.cartEmpty} />
      </DemoScreen>
    );
  }

  return (
    <DemoScreen
      title="Your cart"
      subtitle="Items grouped by vendor before checkout"
      footer={
        <>
          <PriceSummary summary={priceSummary} />
          <Button
            title="Checkout"
            fullWidth
            disabled={!canCheckout}
            onPress={() => router.push(ROUTES.screens.checkout)}
          />
        </>
      }
    >
      {groups.map((group) => (
        <CartVendorGroupCard
          key={group.vendorId}
          group={group}
          isUpdating={isUpdating}
          onIncrease={handleIncrease}
          onDecrease={handleDecrease}
          onRemove={handleRemove}
        />
      ))}
    </DemoScreen>
  );
}
