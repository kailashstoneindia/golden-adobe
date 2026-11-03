import { createHmac, randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { SequelizeModule } from '@nestjs/sequelize';
import { Test, TestingModule } from '@nestjs/testing';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Role } from '@golden-abode/types';

import { GlobalExceptionFilter } from '../../../common/filters/global-exception.filter';
import { ResponseInterceptor } from '../../../common/interceptors/response.interceptor';
import { JwtStrategy } from '../../auth/strategies/jwt.strategy';
import { User } from '../../users/models/user.model';
import { UsersService } from '../../users/users.service';
import { Vendor } from '../../vendors/models/vendor.model';
import { Category } from '../../catalog/models/category.model';
import {
  MasterProduct,
  MasterProductStatus,
  SaleUnitType,
} from '../../catalog/models/master-product.model';
import { VendorListing, VendorListingStatus } from '../../catalog/models/vendor-listing.model';
import { Inventory } from '../../catalog/models/inventory.model';
import { Customer } from '../../customers/models/customer.model';
import { CustomerAddress } from '../../customers/models/customer-address.model';
import { CustomersService } from '../../customers/customers.service';
import { Cart } from '../../cart/models/cart.model';
import { CartService } from '../../cart/cart.service';
import {
  NOTIFICATION_SERVICE,
  NotificationService,
} from '../../notifications/notification.interface';
import { PAYMENT_PROVIDER } from '../../payments/payment-provider.interface';
import { toPaise } from '../../payments/money';
import {
  FakePaymentProvider,
  TEST_WEBHOOK_SECRET,
} from '../../payments/__tests__/fake-payment-provider';
import { CheckoutService } from '../checkout.service';
import { OrdersService } from '../orders.service';
import { OrderPaymentService } from '../order-payment.service';
import { OrdersController } from '../orders.controller';
import { WebhooksController } from '../webhooks.controller';
import { AdminOrdersController } from '../admin-orders.controller';
import { Order, OrderStatus } from '../models/order.model';
import { OrderVendorGroup } from '../models/order-vendor-group.model';
import { OrderItem } from '../models/order-item.model';
import { PAYMENTS_TEST_MODELS } from './test-db';

export const JWT_SECRET = 'payments-test-jwt-secret-1234567890';

type NotificationMethod = keyof NotificationService;

// Records every notification call as { method, args }, and can be told to
// make one method's next call throw once (to prove a failed notification
// never undoes a payment state change).
export class RecordingNotifications implements NotificationService {
  readonly calls: { method: string; args: unknown[] }[] = [];
  private readonly failing = new Set<string>();

  failNext(method: NotificationMethod): void {
    this.failing.add(method);
  }

  callsTo(method: NotificationMethod): { method: string; args: unknown[] }[] {
    return this.calls.filter((c) => c.method === method);
  }

  private async record(method: NotificationMethod, args: unknown[]): Promise<void> {
    this.calls.push({ method, args });
    if (this.failing.delete(method)) {
      throw new Error(`notification ${method} failed (scripted)`);
    }
  }

  sendOrderPlaced(customerId: string, orderId: string): Promise<void> {
    return this.record('sendOrderPlaced', [customerId, orderId]);
  }
  sendOrderStatusChanged(customerId: string, orderId: string, status: string): Promise<void> {
    return this.record('sendOrderStatusChanged', [customerId, orderId, status]);
  }
  sendNewOrderToVendor(vendorId: string, orderVendorGroupId: string): Promise<void> {
    return this.record('sendNewOrderToVendor', [vendorId, orderVendorGroupId]);
  }
  sendHireRequestStatusChanged(
    recipientUserId: string,
    hireRequestId: string,
    status: string,
  ): Promise<void> {
    return this.record('sendHireRequestStatusChanged', [recipientUserId, hireRequestId, status]);
  }
}

export type SeededOrder = {
  orderId: string;
  razorpayOrderId: string;
  groupId: string;
  listingId: string;
  grandTotalPaise: number;
  quantity: number;
};

export type PaymentsTestApp = {
  app: INestApplication;
  moduleRef: TestingModule;
  provider: FakePaymentProvider;
  notifications: RecordingNotifications;
  adminToken: string;
  adminUserId: string;
  customerToken: string;
  customerUserId: string;
  vendorToken: string;
  seedPendingOrder: (opts?: { grandTotal?: string; quantity?: number }) => Promise<SeededOrder>;
  signWebhook: (rawBody: string) => string;
  query: <T>(sql: string, replacements?: object) => Promise<T[]>;
  close: () => Promise<void>;
};

// A real Nest app over real test Postgres, wired the way main.ts wires it
// (rawBody for webhook HMACs, 'api' prefix, ValidationPipe, exception filter,
// response envelope). Only the two outbound edges are faked: the payment
// provider and notifications. Mirrors vendors-test-app.ts.
export async function createPaymentsTestApp(): Promise<PaymentsTestApp> {
  const suffix = Math.random().toString(36).slice(2, 10);
  const provider = new FakePaymentProvider();
  const notifications = new RecordingNotifications();

  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [
          () => ({
            jwt: { accessSecret: JWT_SECRET },
            RAZORPAY_WEBHOOK_SECRET: TEST_WEBHOOK_SECRET,
            search: { workerMode: 'all' },
          }),
        ],
      }),
      SequelizeModule.forRoot({
        dialect: 'postgres',
        host: process.env.TEST_DB_HOST ?? '127.0.0.1',
        port: Number(process.env.TEST_DB_PORT ?? 5432),
        username: process.env.TEST_DB_USER ?? 'postgres',
        password: process.env.TEST_DB_PASS ?? 'postgres',
        database: process.env.TEST_DB_NAME ?? 'golden_abode_test',
        logging: false,
        models: PAYMENTS_TEST_MODELS,
      }),
      SequelizeModule.forFeature(PAYMENTS_TEST_MODELS),
      PassportModule.register({ defaultStrategy: 'jwt' }),
      JwtModule.register({ secret: JWT_SECRET, signOptions: { expiresIn: '15m' } }),
    ],
    controllers: [OrdersController, WebhooksController, AdminOrdersController],
    providers: [
      UsersService,
      JwtStrategy,
      CustomersService,
      CartService,
      CheckoutService,
      OrdersService,
      OrderPaymentService,
      { provide: PAYMENT_PROVIDER, useValue: provider },
      { provide: NOTIFICATION_SERVICE, useValue: notifications },
    ],
  }).compile();

  const app = moduleRef.createNestApplication({ rawBody: true });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  await app.init();

  const sequelize = moduleRef.get(Sequelize);
  const jwt = moduleRef.get(JwtService);

  const admin = await User.create({
    name: 'Payments Test Admin',
    phone: `7${suffix}`.slice(0, 10),
    role: Role.ADMIN,
    isActive: true,
  } as never);
  const customerUser = await User.create({
    name: 'Payments Test Customer',
    phone: `8${suffix}`.slice(0, 10),
    role: Role.CUSTOMER,
    isActive: true,
  } as never);
  const vendorUser = await User.create({
    name: 'Payments Test Vendor',
    phone: `9${suffix}`.slice(0, 10),
    role: Role.VENDOR,
    isActive: true,
  } as never);
  const customer = await Customer.create({
    userId: customerUser.id,
    fullName: 'Payments Test Customer',
  } as never);
  const address = await CustomerAddress.create({
    customerId: customer.id,
    label: 'Home',
    addressLine1: '1 Test Street',
    city: 'Delhi',
    pincode: '110001',
    isDefault: true,
  } as never);
  const vendor = await Vendor.create({
    userId: vendorUser.id,
    shopName: 'Payments Test Shop',
    address: '1 Test Street',
    latitude: 28.7041,
    longitude: 77.1025,
  } as never);
  const category = await Category.create({
    name: `Payments Test Cat ${suffix}`,
    slug: `payments-test-cat-${suffix}`,
    level: 1,
    path: `payments-test-cat-${suffix}`,
    isLeaf: true,
  } as never);

  const seededProductIds: string[] = [];
  const seededListingIds: string[] = [];

  // Raw SQL for assertions and for writes the models would validate away
  // (the schema constraints are exactly what some specs are probing).
  async function query<T>(sql: string, replacements: object = {}): Promise<T[]> {
    try {
      const [rows] = await sequelize.query(sql, {
        replacements: replacements as Record<string, unknown>,
      });
      return rows as T[];
    } catch (err) {
      // Sequelize turns a unique violation into a generic "Validation error";
      // surface Postgres's own message so specs can match the constraint name.
      throw (err as { parent?: Error }).parent ?? err;
    }
  }

  async function seedPendingOrder(
    opts: { grandTotal?: string; quantity?: number } = {},
  ): Promise<SeededOrder> {
    const grandTotal = opts.grandTotal ?? '1000.00';
    const quantity = opts.quantity ?? 1;
    const unitPrice = (Number(grandTotal) / quantity).toFixed(2);
    const razorpayOrderId = `order_test_${randomUUID().replace(/-/g, '').slice(0, 14)}`;

    const product = await MasterProduct.create({
      categoryId: category.id,
      name: `Payments Widget ${randomUUID().slice(0, 8)}`,
      slug: `payments-widget-${randomUUID()}`,
      status: MasterProductStatus.LIVE,
      saleUnitType: SaleUnitType.DISCRETE,
    } as never);
    const listing = await VendorListing.create({
      vendorId: vendor.id,
      masterProductId: product.id,
      price: unitPrice,
      status: VendorListingStatus.ACTIVE,
    } as never);
    // Mirrors the state checkout leaves behind: stock reserved, not yet sold.
    await Inventory.create({
      vendorListingId: listing.id,
      quantityAvailable: 10,
      quantityReserved: quantity,
    } as never);
    seededProductIds.push(product.id);
    seededListingIds.push(listing.id);

    const order = await Order.create({
      customerId: customer.id,
      deliveryAddressId: address.id,
      grandTotal,
      status: OrderStatus.PENDING_PAYMENT,
      razorpayOrderId,
    } as never);
    const group = await OrderVendorGroup.create({
      orderId: order.id,
      vendorId: vendor.id,
      subtotal: grandTotal,
    } as never);
    await OrderItem.create({
      orderVendorGroupId: group.id,
      vendorListingId: listing.id,
      masterProductId: product.id,
      quantity,
      unitPriceSnapshot: unitPrice,
    } as never);

    return {
      orderId: order.id,
      razorpayOrderId,
      groupId: group.id,
      listingId: listing.id,
      grandTotalPaise: toPaise(grandTotal),
      quantity,
    };
  }

  return {
    app,
    moduleRef,
    provider,
    notifications,
    adminToken: jwt.sign({ sub: admin.id, role: Role.ADMIN }),
    adminUserId: admin.id,
    customerToken: jwt.sign({ sub: customerUser.id, role: Role.CUSTOMER }),
    customerUserId: customerUser.id,
    vendorToken: jwt.sign({ sub: vendorUser.id, role: Role.VENDOR }),
    seedPendingOrder,
    signWebhook: (rawBody: string) =>
      createHmac('sha256', TEST_WEBHOOK_SECRET).update(rawBody).digest('hex'),
    query,
    async close() {
      // Children first. Every order belongs to the harness customer, whether
      // seeded here or created through the API, so delete by customer.
      const orderIds = (
        await query<{ id: string }>(`SELECT id FROM orders WHERE customer_id = :id`, {
          id: customer.id,
        })
      ).map((r) => r.id);
      if (orderIds.length > 0) {
        const run = (sql: string) =>
          sequelize.query(sql, { replacements: { ids: orderIds }, type: QueryTypes.DELETE });
        await run(`DELETE FROM refunds WHERE order_id IN (:ids)`);
        await run(`DELETE FROM payment_events WHERE order_id IN (:ids)`);
        await run(
          `DELETE FROM order_items WHERE order_vendor_group_id IN
             (SELECT id FROM order_vendor_group WHERE order_id IN (:ids))`,
        );
        await run(`DELETE FROM order_vendor_group WHERE order_id IN (:ids)`);
        await run(`DELETE FROM orders WHERE id IN (:ids)`);
      }
      await Cart.destroy({ where: { customerId: customer.id } });
      await Inventory.destroy({ where: { vendorListingId: seededListingIds } });
      await VendorListing.destroy({ where: { id: seededListingIds } });
      await MasterProduct.destroy({ where: { id: seededProductIds } });
      await Category.destroy({ where: { id: category.id } });
      await CustomerAddress.destroy({ where: { customerId: customer.id } });
      await Customer.destroy({ where: { id: customer.id } });
      await Vendor.destroy({ where: { id: vendor.id } });
      await User.destroy({ where: { id: [admin.id, customerUser.id, vendorUser.id] } });
      await app.close();
    },
  };
}
