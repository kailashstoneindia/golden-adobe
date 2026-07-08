import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { ConfigService } from '@nestjs/config';
import { User } from '../../modules/users/models/user.model';
import { RefreshToken } from '../../modules/users/models/refresh-token.model';
import { Vendor } from '../../modules/vendors/models/vendor.model';
import { VendorAccountDetails } from '../../modules/vendors/models/vendor-account-details.model';

@Module({
  imports: [
    SequelizeModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const dbConfig = configService.get('database');
        return {
          dialect: 'postgres',
          host: dbConfig.host,
          port: dbConfig.port,
          username: dbConfig.user,
          password: dbConfig.password,
          database: dbConfig.name,
          models: [User, RefreshToken, Vendor, VendorAccountDetails],
          autoLoadModels: true,
          synchronize: false, // Managed by migrations
          logging: false,
          define: {
            timestamps: true,
            underscored: true,
          },
          ...(dbConfig.ssl
            ? {
                dialectOptions: {
                  ssl: { require: true, rejectUnauthorized: false },
                },
              }
            : {}),
        };
      },
    }),
  ],
})
export class DatabaseModule {}
