import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Vehicle } from './models/vehicle.model';
import { Driver } from './models/driver.model';
import { DeliveryAssignment } from './models/delivery-assignment.model';
import { VehiclesService } from './vehicles.service';
import { AdminVehiclesController } from './admin-vehicles.controller';

// Decision 0060. Later sessions add services and controllers here.
@Module({
  imports: [SequelizeModule.forFeature([Vehicle, Driver, DeliveryAssignment])],
  controllers: [AdminVehiclesController],
  providers: [VehiclesService],
  exports: [SequelizeModule, VehiclesService],
})
export class DeliveryModule {}
