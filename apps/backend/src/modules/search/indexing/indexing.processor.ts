import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

import { OutboxPoller } from './outbox.poller';
import { SearchRebuildService } from './rebuild.service';

export const SEARCH_INDEXING_QUEUE = 'search-indexing';
const DRAIN_JOB = 'drain-outbox';

// Poll interval. Price freshness a customer would never notice, per
// search-system-design.md section 4.
const POLL_INTERVAL_MS = 2000;

// Phase 6f (decision 0021, search-system-design.md section 4).
//
// BullMQ on the Redis that is already running. A repeatable job drives the
// drain rather than a bare setInterval, because BullMQ gives retry with
// exponential backoff and — more importantly — survives the worker being
// split into its own Railway service later (the WORKER_MODE flag in section
// 9), which is a config change rather than a rewrite.
//
// The advisory lock inside OutboxPoller, not this queue, is what guarantees a
// single drainer: two processes each running their own repeatable job is
// exactly the rolling-deploy case the lock exists for.
// NOTE: no @Injectable() here. @Processor already marks the class for
// injection, and stacking @Injectable() on top overwrites the processor
// metadata BullModule discovers — the job scheduler still registers and jobs
// still pile up in Redis, but nothing ever consumes them, silently.
@Processor(SEARCH_INDEXING_QUEUE)
export class IndexingProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(IndexingProcessor.name);

  constructor(
    private readonly poller: OutboxPoller,
    private readonly rebuild: SearchRebuildService,
    private readonly config: ConfigService,
    @InjectQueue(SEARCH_INDEXING_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    // Nothing to drain into if this deployment is deliberately on the
    // Postgres engine — the outbox simply accumulates until it is switched
    // back, which search_outbox_backlog makes visible.
    if (this.config.get<string>('search.engine') !== 'meilisearch') {
      this.logger.log('SEARCH_ENGINE is not meilisearch — outbox drain not scheduled');
      return;
    }

    // WORKER_MODE=api means this process serves HTTP only; some other process
    // (or a manual/maintenance run) owns the drain. Scheduling it here anyway
    // would put two drainers in contention for search_outbox_try_lock().
    const workerMode = this.config.get<string>('search.workerMode') ?? 'all';
    if (workerMode === 'api') {
      this.logger.log('WORKER_MODE=api — outbox drain not scheduled in this process');
      return;
    }

    // upsertJobScheduler (BullMQ v6+, replacing the old `repeat` option) is
    // idempotent by name: restarting the process replaces the schedule rather
    // than stacking a duplicate drain loop on every boot.
    await this.queue.upsertJobScheduler(
      DRAIN_JOB,
      { every: POLL_INTERVAL_MS },
      {
        name: DRAIN_JOB,
        opts: {
          removeOnComplete: true,
          removeOnFail: 50,
          // processed_at stays NULL until a run succeeds, so a retry
          // re-delivers the same cutoff window rather than losing it.
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        },
      },
    );

    this.logger.log(`search_outbox drain scheduled every ${POLL_INTERVAL_MS}ms`);
  }

  async process(): Promise<void> {
    // A pending 'all' marker means a full rebuild is due. It is handled BEFORE
    // the incremental drain and instead of it for this tick: the rebuild
    // republishes every document anyway, so draining first would be wasted
    // work against an index that is about to be replaced.
    const rebuild = await this.rebuild.rebuildIfRequested();
    if (rebuild.ran) return;

    await this.poller.drainOnce();
  }
}
