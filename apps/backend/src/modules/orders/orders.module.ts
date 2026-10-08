import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Order } from './models/order.model';
import { OrderVendorGroup } from './models/order-vendor-group.model';
import { OrderItem } from './models/order-item.model';
import { CustomerAddress } from '../customers/models/customer-address.model';
import { CheckoutService } from './checkout.service';
import { OrdersController } from './orders.controller';
import { CartModule } from '../cart/cart.module';
import { CustomersModule } from '../customers/customers.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [
    SequelizeModule.forFeature([Order, OrderVendorGroup, OrderItem, CustomerAddress]),
    CartModule,
    CustomersModule,
    PaymentsModule,
  ],
  controllers: [OrdersController],
  providers: [CheckoutService],
  exports: [CheckoutService],
})
export class OrdersModule {}
