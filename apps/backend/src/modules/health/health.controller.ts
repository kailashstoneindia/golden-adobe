import { Controller, Get } from '@nestjs/common';
import { HealthCheckService, HealthCheck } from '@nestjs/terminus';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    // DB and Redis indicators will be injected here in Phase 1D
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Check API health status' })
  check() {
    return this.health.check([() => ({ api: { status: 'up' } })]);
  }
}
