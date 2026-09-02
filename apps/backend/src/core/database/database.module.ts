import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { ConfigService } from '@nestjs/config';
import { User } from '../../modules/users/models/user.model';
import { RefreshToken } from '../../modules/users/models/refresh-token.model';
import { Vendor } from '../../modules/vendors/models/vendor.model';
import { VendorAccountDetails } from '../../modules/vendors/models/vendor-account-details.model';
import { City } from '../../modules/catalog/models/city.model';

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
          // City is eagerly registered alongside Vendor, NOT left to
          // autoLoadModels, because Vendor declares @BelongsTo(() => City)
          // (added in Phase 6a with vendors.city_id). Models listed here are
          // associated at connection time, before CatalogModule's forFeature
          // has registered City — so omitting it fails the whole boot with
          // "City has not been defined", retrying forever. The Jest suites
          // never caught this because test-db.ts registers every model in one
          // explicit list.
          models: [User, RefreshToken, Vendor, VendorAccountDetails, City],
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
