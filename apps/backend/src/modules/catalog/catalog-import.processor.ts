import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

import { CATALOG_IMPORT_QUEUE, CatalogImportJobsService } from './catalog-import-jobs.service';

// Decision 0063: runs one admin product import per queue message. All the
// state lives in catalog_import_job; the service decides what a redelivered
// or restarted job does. (No @Injectable(): @Processor marks the class, as in
// search/indexing/indexing.processor.ts.)
@Processor(CATALOG_IMPORT_QUEUE)
export class CatalogImportProcessor extends WorkerHost {
  constructor(private readonly jobs: CatalogImportJobsService) {
    super();
  }

  async process(job: Job<{ jobId: string }>): Promise<void> {
    await this.jobs.run(job.data.jobId);
  }
}
