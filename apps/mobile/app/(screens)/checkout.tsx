import type { CartItemDto, CustomerAddressDto } from '@golden-abode/types';
import { Role } from '@golden-abode/types';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';

import { AddressCard } from '../../src/components/addresses';
import { CartVendorGroupCard, PriceSummary } from '../../src/components/cart';
import { DemoScreen } from '../../src/components/demo/DemoScreen';
import { Button, Chip, EmptyStateCard, Text } from '../../src/components/ui';
import {
  EMPTY_STATE_MESSAGES,
  ERROR_MESSAGES,
  HIRE_REQUEST_STATUS_LABELS,
  ROUTES,
} from '../../src/constants';
import { useCustomerHireRequestsQuery } from '../../src/hooks/artisans';
import { useAuth } from '../../src/hooks/auth';
import { useCartQuery } from '../../src/hooks/cart';
import { useAddressesQuery } from '../../src/hooks/customers';
import { usePlaceOrder } from '../../src/hooks/payments';
import { useToast } from '../../src/hooks/useToast';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Colors, Spacing } from '../../src/theme';
import type { CartVendorGroup } from '../../src/types';
import {
  buildCartPriceSummary,
  groupCartItemsByShop,
  hasCartMinOrderShortfall,
  hasPaintCartItems,
  hasUnstockedCartItems,
  isBookingAttributable,
  shortId,
} from '../../src/utils';

function handleIgnoreCartItem(_item: CartItemDto): void {
  return;
}

export default function CheckoutScreen() {
  const { user } = useAuth();
  const isCustomer = user?.role === Role.CUSTOMER;
  const cartQuery = useCartQuery(isCustomer);
  const addressesQuery = useAddressesQuery(isCustomer);
  const { placeOrder, isPlacing } = usePlaceOrder();
  const { showError } = useToast();
  const items: CartItemDto[] = cartQuery.data?.items ?? [];
  const groups: CartVendorGroup[] = useMemo(() => groupCartItemsByShop(items), [items]);
  const priceSummary = useMemo(() => buildCartPriceSummary(groups), [groups]);
  const addresses: CustomerAddressDto[] = addressesQuery.data ?? [];
  const defaultAddressId =
    addresses.find((address: CustomerAddressDto) => address.isDefault)?.id ?? addresses[0]?.id;
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const activeAddressId = selectedAddressId ?? defaultAddressId ?? null;
  const hireRequestsQuery = useCustomerHireRequestsQuery(isCustomer);
  const attributableHireRequests = (hireRequestsQuery.data ?? []).filter((request) =>
    isBookingAttributable(request.status),
  );
  const [bookingId, setBookingId] = useState<string | null>(null);

  const canPlaceOrder =
    Boolean(activeAddressId) &&
    !hasPaintCartItems(items) &&
    !hasUnstockedCartItems(items) &&
    !hasCartMinOrderShortfall(groups);

  const handlePlaceOrder = async (): Promise<void> => {
    if (!activeAddressId) {
      showError(ERROR_MESSAGES.checkoutRequiresAddress);
      return;
    }
    if (!canPlaceOrder) {
      showError(ERROR_MESSAGES.checkoutHasUnstockedItems);
      return;
    }
    await placeOrder(activeAddressId, bookingId ?? undefined);
  };

  if (isPlacing) {
    return (
      <DemoScreen title="Checkout">
        <View style={styles.processing}>
          <ActivityIndicator color={Colors.navy} />
          <Text variant="bodyMedium">Completing your order…</Text>
          <Text variant="caption" color={Colors.inkSoft}>
            Keep the app open while we confirm your payment.
          </Text>
        </View>
      </DemoScreen>
    );
  }

  if (cartQuery.isLoading || addressesQuery.isLoading) {
    return (
      <DemoScreen title="Checkout" showBack>
        <Text variant="body" color={Colors.inkSoft}>
          Loading checkout…
        </Text>
      </DemoScreen>
    );
  }

  if (!isCustomer || items.length === 0) {
    return (
      <DemoScreen title="Checkout" showBack>
        <EmptyStateCard title="Nothing to checkout" message={EMPTY_STATE_MESSAGES.checkoutEmpty} />
      </DemoScreen>
    );
  }

  return (
    <DemoScreen
      title="Checkout"
      showBack
      footer={
        <>
          <PriceSummary summary={priceSummary} />
          <Button
            title={isPlacing ? 'Placing order…' : 'Place order'}
            fullWidth
            disabled={isPlacing || !canPlaceOrder}
            onPress={handlePlaceOrder}
          />
        </>
      }
    >
      {groups.map((group: CartVendorGroup) => (
        <CartVendorGroupCard
          key={group.vendorId}
          group={group}
          isUpdating={false}
          isReadOnly
          onIncrease={handleIgnoreCartItem}
          onDecrease={handleIgnoreCartItem}
          onRemove={handleIgnoreCartItem}
        />
      ))}
      <Text variant="h3">Delivery address</Text>
      {addresses.length === 0 ? (
        <EmptyStateCard title="No saved addresses" message={EMPTY_STATE_MESSAGES.addressesEmpty} />
      ) : (
        addresses.map((address: CustomerAddressDto) => (
          <AddressCard
            key={address.id}
            address={address}
            isSelected={address.id === activeAddressId}
            onPress={() => setSelectedAddressId(address.id)}
          />
        ))
      )}
      <Button
        title="Manage addresses"
        variant="secondary"
        onPress={() => router.push(ROUTES.screens.savedAddresses)}
      />
      {attributableHireRequests.length > 0 ? (
        <>
          <Text variant="h3">Link to an Ustaad job</Text>
          <Text variant="caption" color={Colors.inkSoft}>
            Optional. Link this order if your Ustaad recommended these materials.
          </Text>
          <View style={styles.chips}>
            <Chip label="Don’t link" isSelected={!bookingId} onPress={() => setBookingId(null)} />
            {attributableHireRequests.map((request) => (
              <Chip
                key={request.id}
                label={`Job ${shortId(request.id)} · ${HIRE_REQUEST_STATUS_LABELS[request.status]}`}
                isSelected={bookingId === request.id}
                onPress={() => setBookingId(request.id)}
              />
            ))}
          </View>
        </>
      ) : null}
    </DemoScreen>
  );
}

const styles = StyleSheet.create({
  processing: {
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xxl,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
});
