import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { UsersService } from './users.service';
import { User } from './models/user.model';
import { RefreshToken } from './models/refresh-token.model';

@Module({
  imports: [SequelizeModule.forFeature([User, RefreshToken])],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
