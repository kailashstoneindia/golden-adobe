import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { QueryTypes } from 'sequelize';

import { MasterProduct } from '../../catalog/models/master-product.model';
import { MeiliClient } from '../meili/meili.client';
import { MeiliBootstrap } from '../meili/meili.bootstrap';
import { PRODUCTS_INDEX, PRODUCTS_REBUILD_INDEX } from '../meili/meili.indexes';
import { CandidatePair, SearchDocumentBuilder } from './search-document.builder';

// Phase 6h (decision 0021, search-system-design.md section 7 "Full rebuild —
// atomic swap").
//
// Adding a field to the document or changing tokenisation requires re-pushing
// every document. Doing that against the live index would leave it visibly
// half-updated for the duration, so instead:
//
//   build products_rebuild  ->  verify count  ->  swapIndexes(atomic)  ->  drop old
//
// Meilisearch documents swapIndexes as atomic — either all swap or none — so
// search clients see no downtime and no partial state.
//
// A full rebuild is triggered by an entity_type='all' row in search_outbox.
// 6f's expand_search_outbox() deliberately EXCLUDES those rows, precisely so
// they route here instead of pushing thousands of documents through the
// incremental path one cutoff at a time.

const BATCH_SIZE = 1000;

export type RebuildOutcome = {
  ran: boolean;
  documentsIndexed: number;
  markerRowsConsumed: number;
  swapped: boolean;
};

@Injectable()
export class SearchRebuildService {
  private readonly logger = new Logger(SearchRebuildService.name);

  constructor(
    @InjectModel(MasterProduct)
    private readonly masterProductModel: typeof MasterProduct,
    private readonly meili: MeiliClient,
    private readonly bootstrap: MeiliBootstrap,
    private readonly builder: SearchDocumentBuilder,
  ) {}

  private get sequelize() {
    return this.masterProductModel.sequelize!;
  }

  // Queues a full rebuild. Deliberately just a row insert: the marker is the
  // audit trail of who asked for a rebuild and when, and it means a rebuild
  // can also be requested by a migration or a psql session, not only by the
  // admin endpoint.
  async requestRebuild(reason: string): Promise<void> {
    await this.sequelize.query(
      `INSERT INTO search_outbox (entity_type, entity_id, city_id, reason)
       VALUES ('all', NULL, NULL, :reason)`,
      { type: QueryTypes.INSERT, replacements: { reason } },
    );
    this.logger.log(`Full search rebuild requested: ${reason}`);
  }

  async pendingRebuildCount(): Promise<number> {
    const [row] = await this.sequelize.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM search_outbox
       WHERE entity_type = 'all' AND processed_at IS NULL`,
      { type: QueryTypes.SELECT },
    );
    return Number(row.count);
  }

  // Runs a rebuild if one has been requested. Safe to call on a schedule.
  async rebuildIfRequested(): Promise<RebuildOutcome> {
    if ((await this.pendingRebuildCount()) === 0) {
      return { ran: false, documentsIndexed: 0, markerRowsConsumed: 0, swapped: false };
    }
    return this.rebuildNow();
  }

  async rebuildNow(): Promise<RebuildOutcome> {
    // Cutoff first, same reasoning as the incremental drain: markers arriving
    // mid-rebuild must survive to trigger the NEXT rebuild rather than being
    // consumed by this one, which started before they were written.
    const [{ cutoff }] = await this.sequelize.query<{ cutoff: string }>('SELECT NOW() AS cutoff', {
      type: QueryTypes.SELECT,
    });

    this.logger.log('Full search rebuild starting — building shadow index');

    // Shadow index gets the SAME settings as the live one, from the same
    // source of truth. A shadow configured differently would swap in and
    // silently change ranking.
    await this.meili.raw.deleteIndex(PRODUCTS_REBUILD_INDEX).catch(() => undefined);
    await this.bootstrap.applySettings(PRODUCTS_REBUILD_INDEX);

    // Every (product, city) pair that should currently have a document. This
    // is the same shape expand_search_outbox() produces, but derived from
    // current state rather than from change events.
    const pairRows = await this.sequelize.query<{
      master_product_id: string;
      city_id: string;
    }>(
      `SELECT DISTINCT mp.id AS master_product_id, v.city_id
       FROM master_product mp
       JOIN vendor_listing vl ON vl.master_product_id = mp.id AND vl.status = 'active'
       JOIN vendors v ON v.id = vl.vendor_id
       JOIN city c ON c.id = v.city_id AND c.is_active
       WHERE mp.status = 'live' AND v.city_id IS NOT NULL`,
      { type: QueryTypes.SELECT },
    );

    const pairs: CandidatePair[] = pairRows.map((r) => ({
      masterProductId: r.master_product_id,
      cityId: r.city_id,
    }));

    let indexed = 0;
    for (let i = 0; i < pairs.length; i += BATCH_SIZE) {
      const { documents } = await this.builder.build(pairs.slice(i, i + BATCH_SIZE));
      await this.meili.addDocuments(documents, PRODUCTS_REBUILD_INDEX);
      indexed += documents.length;
    }

    // Verify before swapping. Swapping in an index that is short of documents
    // would be worse than not rebuilding at all, because it looks healthy.
    const shadowCount = await this.meili.documentCount(PRODUCTS_REBUILD_INDEX);
    if (shadowCount !== indexed) {
      throw new Error(
        `Refusing to swap: shadow index holds ${shadowCount} documents but ${indexed} were pushed`,
      );
    }

    await this.meili.swapIndexes(PRODUCTS_INDEX, PRODUCTS_REBUILD_INDEX);

    // After the swap the shadow name holds the OLD index. Kept deliberately —
    // section 7: "the old index can be kept briefly to swap back" — and
    // replaced at the start of the next rebuild rather than dropped here.

    const markedRows = await this.sequelize.query<{ id: string }>(
      `UPDATE search_outbox SET processed_at = NOW()
       WHERE entity_type = 'all'
         AND processed_at IS NULL
         AND enqueued_at <= CAST(:cutoff AS timestamptz)
       RETURNING id`,
      { type: QueryTypes.SELECT, replacements: { cutoff } },
    );
    const marked = markedRows.length;

    this.logger.log(
      `Full search rebuild complete: ${indexed} documents, swapped into '${PRODUCTS_INDEX}', ` +
        `${marked} marker row(s) consumed`,
    );

    return {
      ran: true,
      documentsIndexed: indexed,
      markerRowsConsumed: Number(marked),
      swapped: true,
    };
  }
}
