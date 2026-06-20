import { Controller, Get } from '@nestjs/common';
import { HealthCheckService, HealthCheck, SequelizeHealthIndicator } from '@nestjs/terminus';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { RedisService } from '../../core/redis/redis.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: SequelizeHealthIndicator,
    private redisService: RedisService,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Check API, DB, and Redis health status' })
  check() {
    return this.health.check([
      () => ({ api: { status: 'up' } }),
      () => this.db.pingCheck('postgres'),
      async () => {
        try {
          await this.redisService.getClient().ping();
          return { redis: { status: 'up' } };
        } catch (e) {
          throw new Error('Redis ping failed');
        }
      },
    ]);
  }
}
