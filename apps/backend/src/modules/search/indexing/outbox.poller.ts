import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { QueryTypes } from 'sequelize';

import { MasterProduct } from '../../catalog/models/master-product.model';
import { MeiliClient } from '../meili/meili.client';
import { CandidatePair, SearchDocumentBuilder } from './search-document.builder';

// Phase 6f (decision 0021, search-system-design.md section 4).
//
// The drain sequence, in the exact order the design specifies:
//
//   cutoff := NOW()                    <- taken FIRST; everything hinges on it
//   search_outbox_try_lock()           <- advisory lock, one drainer at a time
//   expand_search_outbox(cutoff)       <- SQL: entity rows -> (product, city)
//   EXISTS-check every pair            <- re-verified fresh, never assumed
//   addDocuments / deleteDocuments     <- id = {product}__{city}
//   mark_search_outbox_processed(cutoff)
//
// WHY THE CUTOFF IS TAKEN FIRST — this is the whole concurrency argument.
// Changes arriving DURING a drain land with enqueued_at > cutoff, so
// mark_search_outbox_processed(cutoff) does not touch them and the next cycle
// picks them up. Worst case a document is rebuilt twice, which is harmless.
// It is never left stale — and a stale document raises no error, so nobody
// would find out until a customer saw a wrong price.

// Meilisearch prefers batched adds over per-document calls.
const BATCH_SIZE = 1000;

export type DrainOutcome = {
  ranDrain: boolean; // false when another worker held the lock
  candidatePairs: number;
  indexed: number;
  deleted: number;
  rowsMarkedProcessed: number;
};

@Injectable()
export class OutboxPoller {
  private readonly logger = new Logger(OutboxPoller.name);

  constructor(
    @InjectModel(MasterProduct)
    private readonly masterProductModel: typeof MasterProduct,
    private readonly meili: MeiliClient,
    private readonly builder: SearchDocumentBuilder,
  ) {}

  private get sequelize() {
    return this.masterProductModel.sequelize!;
  }

  async drainOnce(): Promise<DrainOutcome> {
    const empty: DrainOutcome = {
      ranDrain: false,
      candidatePairs: 0,
      indexed: 0,
      deleted: 0,
      rowsMarkedProcessed: 0,
    };

    // A session-level advisory lock belongs to the CONNECTION that took it.
    // Sequelize pools connections, so a bare sequelize.query() for the lock
    // and another for the unlock can land on two different backends — the
    // unlock then silently no-ops and the lock leaks until that connection is
    // recycled, wedging every future drain with ranDrain=false. Pinning the
    // whole drain to one connection is what makes lock/unlock refer to the
    // same session.
    const connection = await this.sequelize.connectionManager.getConnection({
      type: 'write',
    });

    const runOn = async <T>(sql: string, replacements?: Record<string, unknown>): Promise<T[]> => {
      const result = await this.sequelize.query(sql, {
        type: QueryTypes.SELECT,
        ...(replacements ? { replacements } : {}),
        // `connection` pins the statement to the pooled connection we hold,
        // which is what keeps the advisory lock and its unlock in the same
        // session. It is a real Sequelize option but is absent from the
        // public QueryOptions overloads, hence the cast.
        connection,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      return result as unknown as T[];
    };

    try {
      // 1. Cutoff FIRST, before the lock and before any read.
      const [{ cutoff }] = await runOn<{ cutoff: string }>('SELECT NOW() AS cutoff');

      // 2. Advisory lock. A rolling deploy briefly runs two workers; without
      //    this both would drain and both would mark rows processed.
      const [{ locked }] = await runOn<{ locked: boolean }>(
        'SELECT search_outbox_try_lock() AS locked',
      );
      if (!locked) return empty;

      try {
        // 3. Expansion is SQL — the fan-outs are set operations (a category
        //    subtree is a prefix match on an existing index), so pulling ids
        //    into TypeScript to do it would be pure waste.
        const pairRows = await runOn<{ master_product_id: string; city_id: string }>(
          'SELECT master_product_id, city_id FROM expand_search_outbox(CAST(:cutoff AS timestamptz))',
          { cutoff },
        );

        const pairs: CandidatePair[] = pairRows.map((r) => ({
          masterProductId: r.master_product_id,
          cityId: r.city_id,
        }));

        let indexed = 0;
        let deleted = 0;

        if (pairs.length > 0) {
          // 4. Build + delete-resolution in one live-state query.
          const { documents, deleteIds } = await this.builder.build(pairs);

          // 5. Push to Meilisearch. If ANY batch throws we fall through to the
          //    finally and never mark processed — so the whole cutoff window
          //    is re-delivered next cycle. Re-indexing a correct document is
          //    harmless; leaving a stale one is not.
          for (let i = 0; i < documents.length; i += BATCH_SIZE) {
            await this.meili.addDocuments(documents.slice(i, i + BATCH_SIZE));
          }
          indexed = documents.length;

          for (let i = 0; i < deleteIds.length; i += BATCH_SIZE) {
            await this.meili.deleteDocuments(deleteIds.slice(i, i + BATCH_SIZE));
          }
          deleted = deleteIds.length;
        }

        // 6. Mark processed ONLY after Meilisearch accepted everything above.
        const [{ marked }] = await runOn<{ marked: number }>(
          'SELECT mark_search_outbox_processed(CAST(:cutoff AS timestamptz)) AS marked',
          { cutoff },
        );

        if (pairs.length > 0 || Number(marked) > 0) {
          this.logger.log(
            `search_outbox drain: ${pairs.length} pairs -> ${indexed} indexed, ` +
              `${deleted} deleted, ${marked} rows processed`,
          );
        }

        return {
          ranDrain: true,
          candidatePairs: pairs.length,
          indexed,
          deleted,
          rowsMarkedProcessed: Number(marked),
        };
      } finally {
        // Released even if indexing threw — the rows stay unprocessed and the
        // next cycle retries them, but the lock must not outlive this run.
        // Same connection as the lock, or this would silently no-op.
        await runOn('SELECT search_outbox_unlock()');
      }
    } finally {
      this.sequelize.connectionManager.releaseConnection(connection);
    }
  }
}
