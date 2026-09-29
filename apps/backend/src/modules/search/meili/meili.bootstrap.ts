import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/sequelize';

import { MeiliClient } from './meili.client';
import {
  PRODUCTS_INDEX,
  PRODUCTS_PRIMARY_KEY,
  buildSynonymMap,
  productsSettings,
} from './meili.indexes';
import { SearchSynonym } from '../models/search-synonym.model';

// Phase 6e (decision 0021, search-system-design.md section 5).
//
// Applies index settings on boot, idempotently. Running this twice must be
// indistinguishable from running it once — Meilisearch's updateSettings is
// itself declarative (it replaces, not merges), so re-application is safe by
// construction.
//
// Deliberately NON-FATAL if Meilisearch is unreachable. The Postgres path
// (6c) is a supported permanent mode, not a degraded one, so a search engine
// that is down must not prevent the API from starting — it just means queries
// route to Postgres until it comes back.

@Injectable()
export class MeiliBootstrap implements OnModuleInit {
  private readonly logger = new Logger(MeiliBootstrap.name);

  constructor(
    private readonly meili: MeiliClient,
    private readonly config: ConfigService,
    @InjectModel(SearchSynonym)
    private readonly synonymModel: typeof SearchSynonym,
  ) {}

  async onModuleInit(): Promise<void> {
    // Nothing to bootstrap if the deployment is deliberately running on the
    // Postgres engine — don't hold up boot contacting a service we won't use.
    if (this.config.get<string>('search.engine') !== 'meilisearch') {
      this.logger.log('SEARCH_ENGINE is not meilisearch — skipping index bootstrap');
      return;
    }

    try {
      await this.applySettings(PRODUCTS_INDEX);
    } catch (err) {
      this.logger.error(
        `Meilisearch bootstrap failed — search will fall back to Postgres until it recovers: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  // Public so 6h's rebuild job can configure the shadow index with exactly
  // the same settings before swapping it in. A shadow index configured
  // differently would swap in and silently change ranking.
  async applySettings(indexUid: string): Promise<void> {
    const client = this.meili.raw;

    await client
      .createIndex(indexUid, { primaryKey: PRODUCTS_PRIMARY_KEY })
      .catch((err: unknown) => {
        // Already existing is the normal case on every boot after the first.
        const code =
          (err as { cause?: { code?: string }; code?: string })?.cause?.code ??
          (err as { code?: string })?.code;
        if (code === 'index_already_exists') return;
        throw err;
      });

    const synonymRows = await this.synonymModel.findAll({
      where: { isActive: true },
      attributes: ['term', 'synonyms'],
    });

    const settings = {
      ...productsSettings,
      synonyms: buildSynonymMap(synonymRows.map((r) => ({ term: r.term, synonyms: r.synonyms }))),
    };

    const task = await client.index(indexUid).updateSettings(settings);
    await client.tasks.waitForTask(task.taskUid);

    this.logger.log(
      `Meilisearch index '${indexUid}' settings applied ` +
        `(${synonymRows.length} synonym terms, disableOnNumbers=true)`,
    );
  }
}
