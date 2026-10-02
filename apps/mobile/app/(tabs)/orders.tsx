import { Role } from '@golden-abode/types';

import { DemoScreen } from '../../src/components/demo/DemoScreen';
import { EmptyStateCard } from '../../src/components/ui';
import { EMPTY_STATE_MESSAGES } from '../../src/constants';
import { useAuth } from '../../src/hooks/auth';

export default function OrdersTabScreen() {
  const { user } = useAuth();
  const isVendor = user?.role === Role.VENDOR;

  return (
    <DemoScreen
      title="Orders"
      subtitle={
        isVendor
          ? 'Incoming requests from customers on your shop'
          : 'Track active deliveries and review past orders'
      }
    >
      <EmptyStateCard
        title="No orders yet"
        message={
          isVendor
            ? EMPTY_STATE_MESSAGES.ordersVendorEmpty
            : EMPTY_STATE_MESSAGES.ordersCustomerEmpty
        }
      />
    </DemoScreen>
  );
}
