import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Order } from './models/order.model';
import { OrderVendorGroup } from './models/order-vendor-group.model';
import { OrderItem } from './models/order-item.model';
import { CustomerAddress } from '../customers/models/customer-address.model';
import { CheckoutService } from './checkout.service';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { WebhooksController } from './webhooks.controller';
import { AdminOrdersController } from './admin-orders.controller';
import { CartModule } from '../cart/cart.module';
import { CustomersModule } from '../customers/customers.module';
import { PaymentsModule } from '../payments/payments.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    SequelizeModule.forFeature([Order, OrderVendorGroup, OrderItem, CustomerAddress]),
    CartModule,
    CustomersModule,
    PaymentsModule,
    NotificationsModule,
  ],
  controllers: [OrdersController, WebhooksController, AdminOrdersController],
  providers: [CheckoutService, OrdersService],
  exports: [CheckoutService, OrdersService],
})
export class OrdersModule {}
