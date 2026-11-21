import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { CatalogModule } from './catalog.module';
import {
  CATALOG_IMPORT_QUEUE,
  CatalogImportJobsService,
  IMPORT_JOB_QUEUE,
} from './catalog-import-jobs.service';
import { CatalogImportProcessor } from './catalog-import.processor';

// Decision 0063: background admin imports. Kept out of CatalogModule so the
// catalog (and every test that builds it) does not need a queue connection;
// the BullMQ connection itself is configured once in SearchModule.
@Module({
  imports: [CatalogModule, BullModule.registerQueue({ name: CATALOG_IMPORT_QUEUE })],
  providers: [
    CatalogImportJobsService,
    CatalogImportProcessor,
    { provide: IMPORT_JOB_QUEUE, useExisting: getQueueToken(CATALOG_IMPORT_QUEUE) },
  ],
  exports: [CatalogImportJobsService],
})
export class CatalogImportJobsModule {}
