import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

import { ArtisansController } from './artisans.controller';
import { AdminArtisansController } from './admin-artisans.controller';
import { ArtisansService } from './artisans.service';
import { HireRequestsService } from './hire-requests.service';
import { Artisan } from './models/artisan.model';
import { ArtisanAccountDetails } from './models/artisan-account-details.model';
import { ArtisanTeamMember } from './models/artisan-team-member.model';
import { ArtisanHireRequest } from './models/artisan-hire-request.model';
import { ArtisanCompletionEstimate } from './models/artisan-completion-estimate.model';
import { Order } from '../orders/models/order.model';
import { UsersModule } from '../users/users.module';
import { CatalogModule } from '../catalog/catalog.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    SequelizeModule.forFeature([
      Artisan,
      ArtisanAccountDetails,
      ArtisanTeamMember,
      ArtisanHireRequest,
      ArtisanCompletionEstimate,
      // Registered here too, independently of OrdersModule's own
      // registration — reading an order to list "orders attributed to
      // this hire request" (decision 0045) needs the model, not the
      // whole orders feature module. Mirrors OrdersModule's own
      // independent registration of ArtisanHireRequest for the reverse
      // direction: sequelize-typescript's forFeature only needs the model
      // class, not ownership of the module that declares it, so this
      // creates no module-to-module import in either direction.
      Order,
    ]),
    UsersModule,
    // For OBJECT_STORAGE (decision 0033's presigned-POST S3 plumbing,
    // exported by CatalogModule specifically for this reuse).
    CatalogModule,
    NotificationsModule,
  ],
  controllers: [ArtisansController, AdminArtisansController],
  providers: [ArtisansService, HireRequestsService],
  exports: [ArtisansService, HireRequestsService],
})
export class ArtisansModule {}
