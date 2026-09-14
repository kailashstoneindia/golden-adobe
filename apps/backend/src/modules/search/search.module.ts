import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { MasterProduct } from '../catalog/models/master-product.model';
import { CatalogModule } from '../catalog/catalog.module';
import { PostgresSearchService } from './fallback/postgres-search.service';
import { SearchSynonym } from './models/search-synonym.model';
import { MeiliClient } from './meili/meili.client';
import { MeiliBootstrap } from './meili/meili.bootstrap';
import { SearchDocumentBuilder } from './indexing/search-document.builder';
import { OutboxPoller } from './indexing/outbox.poller';
import { IndexingProcessor, SEARCH_INDEXING_QUEUE } from './indexing/indexing.processor';
import { SearchRebuildService } from './indexing/rebuild.service';
import { SearchService } from './search.service';
import { AdminSearchController, SearchController } from './search.controller';

// Phase 6 search runtime (decision 0021). Built in the order
// 6c -> 6e -> 6f -> 6g -> 6h, each verified live before the next begins.
//
// Currently present:
//   6c — the Postgres search path, which per decision 0019 is permanent
//        rather than scaffolding (outage fallback AND admin's primary search
//        path, since a draft product has no listing and therefore no
//        Meilisearch document).
//   6e — the Meilisearch client, index settings as code, and the idempotent
//        boot-time bootstrap. Bootstrap is deliberately non-fatal: an
//        unreachable search engine must not stop the API booting, it just
//        means queries route to Postgres.
//   6f — the outbox drain: SearchDocumentBuilder (candidate pairs -> documents
//        or delete-ids, re-verified against live state), OutboxPoller (the
//        cutoff/lock/expand/push/mark sequence), and a BullMQ repeatable job
//        driving it on the Redis that already runs for OTP and rate limiting.
//   6g — the query layer: SearchService (city resolved server-side first,
//        engine selection, transparent Postgres fallback, 60s Redis cache),
//        the public SearchController, and the admin-only, Postgres-only
//        AdminSearchController that can reach draft products.
//   6h — SearchRebuildService: shadow-index rebuild and atomic swap, fed by
//        entity_type='all' outbox markers that 6f deliberately ignores.
//
// All of 6c/6e/6f/6g/6h are now present.
@Module({
  imports: [
    SequelizeModule.forFeature([MasterProduct, SearchSynonym]),
    CatalogModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('redis.url');
        return {
          connection: url
            ? { url }
            : {
                host: config.get<string>('redis.host'),
                port: config.get<number>('redis.port'),
                password: config.get<string>('redis.password') || undefined,
              },
        };
      },
    }),
    BullModule.registerQueue({ name: SEARCH_INDEXING_QUEUE }),
  ],
  controllers: [SearchController, AdminSearchController],
  providers: [
    PostgresSearchService,
    MeiliClient,
    MeiliBootstrap,
    SearchDocumentBuilder,
    OutboxPoller,
    IndexingProcessor,
    SearchService,
    SearchRebuildService,
  ],
  exports: [
    PostgresSearchService,
    MeiliClient,
    MeiliBootstrap,
    SearchDocumentBuilder,
    OutboxPoller,
    SearchService,
    SearchRebuildService,
  ],
})
export class SearchModule {}
