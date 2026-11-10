import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { CatalogModule } from '../catalog/catalog.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { User } from '../users/models/user.model';
import { Vehicle } from './models/vehicle.model';
import { Driver } from './models/driver.model';
import { DeliveryAssignment } from './models/delivery-assignment.model';
import { VehiclesService } from './vehicles.service';
import { DriversService } from './drivers.service';
import { DeliveryAssignmentsService } from './delivery-assignments.service';
import { AdminVehiclesController } from './admin-vehicles.controller';
import { AdminDriversController } from './admin-drivers.controller';
import { AdminDeliveryController } from './admin-delivery.controller';
import { DeliveryPhotoService } from './delivery-photo.service';
import { DriverDeliveriesService } from './driver-deliveries.service';
import { DriverController } from './driver.controller';

// Decision 0060. Later sessions add services and controllers here.
@Module({
  imports: [
    // OBJECT_STORAGE for driver documents and, later, delivery photos.
    CatalogModule,
    NotificationsModule,
    SequelizeModule.forFeature([Vehicle, Driver, DeliveryAssignment, User]),
  ],
  controllers: [
    AdminVehiclesController,
    AdminDriversController,
    AdminDeliveryController,
    DriverController,
  ],
  providers: [
    VehiclesService,
    DriversService,
    DeliveryAssignmentsService,
    DeliveryPhotoService,
    DriverDeliveriesService,
  ],
  exports: [
    SequelizeModule,
    VehiclesService,
    DriversService,
    DeliveryAssignmentsService,
    DeliveryPhotoService,
    DriverDeliveriesService,
  ],
})
export class DeliveryModule {}
