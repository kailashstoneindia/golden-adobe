import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

import { User } from '../users/models/user.model';
import { Vendor } from '../vendors/models/vendor.model';
import { VendorAccountDetails } from '../vendors/models/vendor-account-details.model';
import { Artisan } from '../artisans/models/artisan.model';
import { ArtisansModule } from '../artisans/artisans.module';
import { VendorsModule } from '../vendors/vendors.module';
import { UsersModule } from '../users/users.module';
import { ArtisanAccountDetails } from '../artisans/models/artisan-account-details.model';
import { ArtisanTeamMember } from '../artisans/models/artisan-team-member.model';
import { ArtisanHireRequest } from '../artisans/models/artisan-hire-request.model';
import { ArtisanCompletionEstimate } from '../artisans/models/artisan-completion-estimate.model';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [
    SequelizeModule.forFeature([
      User,
      Vendor,
      VendorAccountDetails,
      Artisan,
      ArtisanAccountDetails,
      ArtisanTeamMember,
      ArtisanHireRequest,
      ArtisanCompletionEstimate,
    ]),
    // AdminService delegates ustaad approve/reject to ArtisansService and reads
    // the awaiting-document count from UsersService (decision 0058).
    UsersModule,
    ArtisansModule,
    VendorsModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
