import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { User } from '../users/models/user.model';
import { Vehicle } from './models/vehicle.model';
import { Driver } from './models/driver.model';
import { DeliveryAssignment } from './models/delivery-assignment.model';
import { VehiclesService } from './vehicles.service';
import { DriversService } from './drivers.service';
import { AdminVehiclesController } from './admin-vehicles.controller';
import { AdminDriversController } from './admin-drivers.controller';

// Decision 0060. Later sessions add services and controllers here.
@Module({
  imports: [SequelizeModule.forFeature([Vehicle, Driver, DeliveryAssignment, User])],
  controllers: [AdminVehiclesController, AdminDriversController],
  providers: [VehiclesService, DriversService],
  exports: [SequelizeModule, VehiclesService, DriversService],
})
export class DeliveryModule {}
