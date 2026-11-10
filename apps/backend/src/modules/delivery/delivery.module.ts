import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Vehicle } from './models/vehicle.model';
import { Driver } from './models/driver.model';
import { DeliveryAssignment } from './models/delivery-assignment.model';

// Decision 0060. Later sessions add services and controllers here.
@Module({
  imports: [SequelizeModule.forFeature([Vehicle, Driver, DeliveryAssignment])],
  exports: [SequelizeModule],
})
export class DeliveryModule {}
