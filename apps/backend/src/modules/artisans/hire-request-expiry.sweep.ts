import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';

import { HireRequestsService } from './hire-requests.service';

// Decision 0055: an ustaad who doesn't answer within 48 hours lets the
// request expire. Accept/decline already refuse a late answer on their own,
// so this sweep only has to move the status for everyone else to see; 15
// minutes of lag is fine.
//
// Gated like OrdersService.sweepStaleReservations (0049): WORKER_MODE=api
// means another process owns scheduled work. No lock needed — the expiry is
// one guarded UPDATE, so two overlapping sweeps can't double-expire a row.
@Injectable()
export class HireRequestExpirySweep {
  private readonly logger = new Logger(HireRequestExpirySweep.name);

  constructor(
    private readonly hireRequests: HireRequestsService,
    private readonly configService: ConfigService,
  ) {}

  @Cron('0 */15 * * * *')
  async run(): Promise<void> {
    if (this.configService.get<string>('search.workerMode', 'all') === 'api') {
      return;
    }
    try {
      const expired = await this.hireRequests.expireStaleResponses();
      if (expired > 0) {
        this.logger.log(`expired ${expired} hire request(s) the artisan did not answer in time`);
      }
    } catch (err) {
      this.logger.error(
        `hire request expiry sweep failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
