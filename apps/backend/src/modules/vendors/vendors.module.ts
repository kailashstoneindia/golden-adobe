import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { VendorsController } from './vendors.controller';
import { AdminVendorsController } from './admin-vendors.controller';
import { VendorsService } from './vendors.service';
import { Vendor } from './models/vendor.model';
import { VendorAccountDetails } from './models/vendor-account-details.model';
import { UsersModule } from '../users/users.module';
import { CatalogModule } from '../catalog/catalog.module';

// CatalogModule is imported here, not the reverse: it already exports
// CityResolverService and (via SequelizeModule) the Category and
// VendorCategory models, and it already registers the Vendor model for its
// own vendor-scoped controllers. Importing VendorsModule into CatalogModule
// instead would close a cycle.
@Module({
  imports: [
    SequelizeModule.forFeature([Vendor, VendorAccountDetails]),
    UsersModule,
    CatalogModule,
  ],
  controllers: [VendorsController, AdminVendorsController],
  providers: [VendorsService],
  exports: [VendorsService],
})
export class VendorsModule {}
