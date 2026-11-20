import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import configuration from './config/configuration';
import { HealthModule } from './modules/health/health.module';
import { CoreModule } from './core/core.module';
import { AuthModule } from './modules/auth/auth.module';
import { VendorsModule } from './modules/vendors/vendors.module';
import { ArtisansModule } from './modules/artisans/artisans.module';
import { AdminModule } from './modules/admin/admin.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { SearchModule } from './modules/search/search.module';
import { CustomersModule } from './modules/customers/customers.module';
import { CartModule } from './modules/cart/cart.module';
import { OrdersModule } from './modules/orders/orders.module';
import { DeliveryModule } from './modules/delivery/delivery.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    // Decision 0049 — drives OrdersService's stale-reservation sweep.
    ScheduleModule.forRoot(),
    CoreModule,
    HealthModule,
    AuthModule,
    VendorsModule,
    ArtisansModule,
    AdminModule,
    CatalogModule,
    SearchModule,
    CustomersModule,
    CartModule,
    OrdersModule,
    DeliveryModule,
  ],
})
export class AppModule {}
