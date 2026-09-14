import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Meilisearch, Index } from 'meilisearch';
import { SearchDocumentRecord } from '@golden-abode/types';

// Phase 6e (decision 0021, search-system-design.md section 8 "meili/").
//
// Thin wrapper over the official client. Everything it needs — host, keys,
// index name — comes from configuration, never a literal, because decision
// 0021's standing rule is that moving from the local Docker container to
// Railway must be an env var change and never a code edit.

@Injectable()
export class MeiliClient {
  private readonly logger = new Logger(MeiliClient.name);
  private readonly client: Meilisearch;
  private readonly productsIndexName: string;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('search.meili.host')!;
    const apiKey = this.config.get<string>('search.meili.masterKey')!;
    this.productsIndexName = this.config.get<string>('search.meili.productsIndex')!;
    this.client = new Meilisearch({ host, apiKey });
  }

  get raw(): Meilisearch {
    return this.client;
  }

  get productsIndexUid(): string {
    return this.productsIndexName;
  }

  index(uid: string = this.productsIndexName): Index {
    return this.client.index(uid);
  }

  // Used by the fallback decision in 6g: if this is false, queries route to
  // the Postgres path rather than erroring. Deliberately swallows the error —
  // an unreachable search engine is an expected, handled state, not an
  // exception the caller should deal with.
  async isHealthy(): Promise<boolean> {
    try {
      const health = await this.client.health();
      return health.status === 'available';
    } catch (err) {
      this.logger.warn(
        `Meilisearch health check failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  async addDocuments(docs: SearchDocumentRecord[], uid?: string): Promise<void> {
    if (docs.length === 0) return;
    const task = await this.index(uid).addDocuments(docs, { primaryKey: 'id' });
    await this.awaitTask(task.taskUid, `addDocuments(${docs.length})`);
  }

  // Ids are deterministic (`{productId}__{cityId}`), so a delete never needs a
  // query first — search-system-design.md section 3, "the delete path".
  async deleteDocuments(ids: string[], uid?: string): Promise<void> {
    if (ids.length === 0) return;
    const task = await this.index(uid).deleteDocuments(ids);
    await this.awaitTask(task.taskUid, `deleteDocuments(${ids.length})`);
  }

  // waitForTask resolves when a task REACHES A TERMINAL STATE — succeeded or
  // failed alike. It does not throw on failure. Without this check a rejected
  // batch is indistinguishable from a successful one, the drain marks its
  // outbox rows processed, and the index is quietly missing documents that
  // nothing will ever re-enqueue. That is precisely the "a stale index raises
  // no error" failure mode the design warns about, so it is made loud here.
  private async awaitTask(taskUid: number, what: string): Promise<void> {
    const task = await this.client.tasks.waitForTask(taskUid);
    if (task.status !== 'succeeded') {
      const detail = task.error
        ? `${task.error.code}: ${task.error.message}`
        : `status=${task.status}`;
      throw new Error(`Meilisearch ${what} did not succeed — ${detail}`);
    }
  }

  async documentCount(uid?: string): Promise<number> {
    const stats = await this.index(uid).getStats();
    return stats.numberOfDocuments;
  }

  // Atomic index swap for 6h's rebuild. Meilisearch documents this as a
  // transaction — either both indexes swap or neither does — so search
  // clients never observe a partial state. After it returns, `shadowUid`
  // holds what `liveUid` held, which is what makes swapping back possible.
  async swapIndexes(liveUid: string, shadowUid: string): Promise<void> {
    // rename:false is a true swap — both indexes keep existing and exchange
    // contents, so `shadowUid` ends up holding the old live index and can be
    // swapped back. rename:true would move rather than swap, discarding it.
    const task = await this.client.swapIndexes([{ indexes: [liveUid, shadowUid], rename: false }]);
    await this.awaitTask(task.taskUid, `swapIndexes(${liveUid} <-> ${shadowUid})`);
  }
}
