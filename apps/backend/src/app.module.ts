import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    HealthModule,
    // CoreModule (Database, Redis) will be added in Phase 1D
    // AuthModule, UsersModule will be added in Phase 1E
  ],
})
export class AppModule {}
