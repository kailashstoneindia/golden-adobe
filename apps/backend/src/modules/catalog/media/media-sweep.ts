import { ObjectStorage } from './object-storage';
import { parseMediaKey } from './media-keys';

// Deletes media objects that no database row refers to (decision 0033): an
// upload that was presigned but never confirmed, or leftovers from a delete
// whose cleanup failed. It is a plain function so it can be run by a script on
// a timer, with no scheduler or queue inside the app.
//
// Conservative by construction:
//   - a key this app would not have written is NEVER deleted, only reported
//   - objects younger than the minimum age are skipped (an upload may be in flight)
//   - a media id that exists in the database keeps all of its objects
//   - if more than maxDeletions would go in one run, NOTHING is deleted

export type SweepOptions = {
  apply: boolean;
  minAgeHours: number;
  maxDeletions: number;
  now?: Date;
};

export type SweepReport = {
  scanned: number;
  unparseable: string[];
  tooNew: number;
  referenced: number;
  orphans: string[];
  deleted: number;
  // True when the circuit breaker tripped. Nothing was deleted.
  aborted: boolean;
};

export type SweepDeps = {
  storage: ObjectStorage;
  // Which of these media ids still have a row.
  findExistingMediaIds: (ids: string[]) => Promise<Set<string>>;
};

const PREFIXES = ['original/products/', 'variants/products/'];
const LOOKUP_BATCH = 1000;

export async function sweepOrphanMedia(
  deps: SweepDeps,
  options: SweepOptions,
): Promise<SweepReport> {
  const cutoff = (options.now ?? new Date()).getTime() - options.minAgeHours * 3600 * 1000;
  const report: SweepReport = {
    scanned: 0,
    unparseable: [],
    tooNew: 0,
    referenced: 0,
    orphans: [],
    deleted: 0,
    aborted: false,
  };

  const candidates: { key: string; mediaId: string }[] = [];
  for (const prefix of PREFIXES) {
    let token: string | undefined;
    do {
      const page = await deps.storage.list(prefix, token);
      for (const object of page.objects) {
        report.scanned++;
        const parsed = parseMediaKey(object.key);
        if (!parsed) {
          report.unparseable.push(object.key);
        } else if (object.lastModified.getTime() > cutoff) {
          report.tooNew++;
        } else {
          candidates.push({ key: object.key, mediaId: parsed.mediaId });
        }
      }
      token = page.nextToken;
    } while (token);
  }

  const existing = new Set<string>();
  const ids = [...new Set(candidates.map((c) => c.mediaId))];
  for (let i = 0; i < ids.length; i += LOOKUP_BATCH) {
    for (const id of await deps.findExistingMediaIds(ids.slice(i, i + LOOKUP_BATCH))) {
      existing.add(id);
    }
  }

  for (const candidate of candidates) {
    if (existing.has(candidate.mediaId)) report.referenced++;
    else report.orphans.push(candidate.key);
  }

  if (report.orphans.length > options.maxDeletions) {
    report.aborted = true;
    return report;
  }
  if (options.apply && report.orphans.length > 0) {
    await deps.storage.deleteMany(report.orphans);
    report.deleted = report.orphans.length;
  }
  return report;
}
