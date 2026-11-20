import { CATALOG_TEST_MODELS } from '../../catalog/__tests__/test-db';
import { Customer } from '../../customers/models/customer.model';
import { CustomerAddress } from '../../customers/models/customer-address.model';
import { Cart } from '../../cart/models/cart.model';
import { CartItem } from '../../cart/models/cart-item.model';
import { Order } from '../models/order.model';
import { OrderVendorGroup } from '../models/order-vendor-group.model';
import { OrderItem } from '../models/order-item.model';
import { PaymentEvent } from '../models/payment-event.model';
import { Refund } from '../models/refund.model';
import { Vehicle } from '../../delivery/models/vehicle.model';
import { Driver } from '../../delivery/models/driver.model';
import { DeliveryAssignment } from '../../delivery/models/delivery-assignment.model';

// Every model the orders module touches plus everything those associate
// with, transitively — sequelize-typescript throws "X has not been defined"
// at connection time otherwise (same rationale as VENDOR_TEST_MODELS). The
// catalog list already carries User, Vendor, VendorListing, Inventory,
// MasterProduct, Category and the Artisan chain that User/OrdersService pull
// in; this adds the customer, cart and order tables on top.
export const PAYMENTS_TEST_MODELS = [
  ...CATALOG_TEST_MODELS,
  Customer,
  CustomerAddress,
  Cart,
  CartItem,
  Order,
  OrderVendorGroup,
  OrderItem,
  PaymentEvent,
  Refund,
  Vehicle,
  Driver,
  DeliveryAssignment,
];
