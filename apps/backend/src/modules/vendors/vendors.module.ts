import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { VendorsController } from './vendors.controller';
import { VendorsService } from './vendors.service';
import { Vendor } from './models/vendor.model';
import { VendorAccountDetails } from './models/vendor-account-details.model';

@Module({
  imports: [SequelizeModule.forFeature([Vendor, VendorAccountDetails])],
  controllers: [VendorsController],
  providers: [VendorsService],
  exports: [VendorsService],
})
export class VendorsModule {}
