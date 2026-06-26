import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { UsersService } from './users.service';
import { User } from './models/user.model';
import { RefreshToken } from './models/refresh-token.model';
import { UsersController } from './users.controller';

@Module({
  imports: [SequelizeModule.forFeature([User, RefreshToken])],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
