import { Role } from '@golden-abode/types';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';

import { AddressCard } from '../../src/components/addresses';
import { CartVendorGroupCard } from '../../src/components/cart';
import { DemoScreen } from '../../src/components/demo/DemoScreen';
import { Button, EmptyStateCard, Text } from '../../src/components/ui';
import { EMPTY_STATE_MESSAGES, ERROR_MESSAGES, ROUTES } from '../../src/constants';
import { useAuth } from '../../src/hooks/auth';
import { useCartQuery } from '../../src/hooks/cart';
import { useAddressesQuery } from '../../src/hooks/customers';
import { usePlaceOrder } from '../../src/hooks/payments';
import { useToast } from '../../src/hooks/useToast';
import { Colors } from '../../src/theme';
import { cartGrandTotal, formatInr, groupCartItemsByShop } from '../../src/utils';

export default function CheckoutScreen() {
  const { user } = useAuth();
  const isCustomer = user?.role === Role.CUSTOMER;
  const cartQuery = useCartQuery(isCustomer);
  const addressesQuery = useAddressesQuery(isCustomer);
  const { placeOrder, isPlacing } = usePlaceOrder();
  const { showError } = useToast();
  const items = cartQuery.data?.items ?? [];
  const groups = useMemo(() => groupCartItemsByShop(items), [items]);
  const addresses = addressesQuery.data ?? [];
  const defaultAddressId = addresses.find((address) => address.isDefault)?.id ?? addresses[0]?.id;
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const activeAddressId = selectedAddressId ?? defaultAddressId ?? null;

  const handlePlaceOrder = async (): Promise<void> => {
    if (!activeAddressId) {
      showError(ERROR_MESSAGES.checkoutRequiresAddress);
      return;
    }
    await placeOrder(activeAddressId);
  };

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
          <Text variant="bodyMedium">Total {formatInr(cartGrandTotal(groups))}</Text>
          <Button
            title={isPlacing ? 'Placing order…' : 'Place order'}
            fullWidth
            disabled={isPlacing || !activeAddressId}
            onPress={handlePlaceOrder}
          />
        </>
      }
    >
      {groups.map((group) => (
        <CartVendorGroupCard
          key={group.vendorId}
          group={group}
          isUpdating={false}
          isReadOnly
          onIncrease={() => undefined}
          onDecrease={() => undefined}
          onRemove={() => undefined}
        />
      ))}
      <Text variant="h3">Delivery address</Text>
      {addresses.length === 0 ? (
        <EmptyStateCard title="No saved addresses" message={EMPTY_STATE_MESSAGES.addressesEmpty} />
      ) : (
        addresses.map((address) => (
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
    </DemoScreen>
  );
}
