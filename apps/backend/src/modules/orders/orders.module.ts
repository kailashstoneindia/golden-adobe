import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Order } from './models/order.model';
import { OrderVendorGroup } from './models/order-vendor-group.model';
import { OrderItem } from './models/order-item.model';
import { PaymentEvent } from './models/payment-event.model';
import { Refund } from './models/refund.model';
import { CustomerAddress } from '../customers/models/customer-address.model';
import { Artisan } from '../artisans/models/artisan.model';
import { ArtisanHireRequest } from '../artisans/models/artisan-hire-request.model';
import { CheckoutService } from './checkout.service';
import { OrdersService } from './orders.service';
import { OrderPaymentService } from './order-payment.service';
import { RefundsService } from './refunds.service';
import { OrdersController } from './orders.controller';
import { WebhooksController } from './webhooks.controller';
import { AdminOrdersController } from './admin-orders.controller';
import { CartModule } from '../cart/cart.module';
import { CustomersModule } from '../customers/customers.module';
import { PaymentsModule } from '../payments/payments.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CatalogModule } from '../catalog/catalog.module';

@Module({
  imports: [
    SequelizeModule.forFeature([
      Order,
      OrderVendorGroup,
      OrderItem,
      CustomerAddress,
      PaymentEvent,
      Refund,
      Artisan,
      ArtisanHireRequest,
    ]),
    CartModule,
    CustomersModule,
    PaymentsModule,
    NotificationsModule,
    CatalogModule,
  ],
  controllers: [OrdersController, WebhooksController, AdminOrdersController],
  providers: [CheckoutService, OrdersService, OrderPaymentService, RefundsService],
  exports: [CheckoutService, OrdersService, OrderPaymentService, RefundsService],
})
export class OrdersModule {}
