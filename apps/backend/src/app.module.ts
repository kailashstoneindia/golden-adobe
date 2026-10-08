import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { HealthModule } from './modules/health/health.module';
import { CoreModule } from './core/core.module';
import { AuthModule } from './modules/auth/auth.module';
import { VendorsModule } from './modules/vendors/vendors.module';
import { AdminModule } from './modules/admin/admin.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { SearchModule } from './modules/search/search.module';
import { CustomersModule } from './modules/customers/customers.module';
import { CartModule } from './modules/cart/cart.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    CoreModule,
    HealthModule,
    AuthModule,
    VendorsModule,
    AdminModule,
    CatalogModule,
    SearchModule,
    CustomersModule,
    CartModule,
  ],
})
export class AppModule {}
