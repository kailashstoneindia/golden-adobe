import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { VendorsController } from './vendors.controller';
import { AdminVendorsController } from './admin-vendors.controller';
import { VendorListingsController } from '../catalog/vendor-listings.controller';
import { VendorsService } from './vendors.service';
import { Vendor } from './models/vendor.model';
import { VendorAccountDetails } from './models/vendor-account-details.model';
import { UsersModule } from '../users/users.module';
import { CatalogModule } from '../catalog/catalog.module';
import { OrdersModule } from '../orders/orders.module';

// CatalogModule is imported here, not the reverse: it already exports
// CityResolverService and (via SequelizeModule) the Category and
// VendorCategory models, and it already registers the Vendor model for its
// own vendor-scoped controllers. Importing VendorsModule into CatalogModule
// instead would close a cycle.
//
// OrdersModule is imported here for the same reason, checked before
// adding it: OrdersModule (and everything it itself imports — CartModule,
// CustomersModule, PaymentsModule, NotificationsModule) does not import
// VendorsModule anywhere, so this direction is safe and does not close a
// cycle the way the reverse would.
@Module({
  imports: [
    SequelizeModule.forFeature([Vendor, VendorAccountDetails]),
    UsersModule,
    CatalogModule,
    OrdersModule,
  ],
  // VendorListingsController is declared here rather than in CatalogModule
  // even though it lives in the catalog folder beside the models it serves:
  // it injects VendorsService to resolve the caller's vendor, and
  // CatalogModule cannot import VendorsModule without closing a cycle.
  // StockService reaches it through CatalogModule's exports.
  controllers: [VendorsController, AdminVendorsController, VendorListingsController],
  providers: [VendorsService],
  exports: [VendorsService],
})
export class VendorsModule {}
