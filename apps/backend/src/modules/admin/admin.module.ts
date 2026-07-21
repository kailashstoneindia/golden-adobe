import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

import { User } from '../users/models/user.model';
import { Vendor } from '../vendors/models/vendor.model';
import { VendorAccountDetails } from '../vendors/models/vendor-account-details.model';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [SequelizeModule.forFeature([User, Vendor, VendorAccountDetails])],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
