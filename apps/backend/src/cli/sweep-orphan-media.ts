// Removes media objects that no database row refers to (decision 0033):
//
//   node dist/cli/sweep-orphan-media.js [--apply] [--min-age-hours N] [--max-deletions N]
//   pnpm --filter @golden-abode/backend media:sweep
//
// Dry-run by default: it prints what it WOULD delete. Run from a systemd timer
// on the box; there is deliberately no scheduler inside the app. Exits 1 when
// the circuit breaker trips, so the timer's failure is visible.
import { QueryTypes, Sequelize } from 'sequelize';

import { resolveDatabaseConfig } from '../config/connection-url';
import { loadStorageConfig } from '../config/storage.config';
import { sweepOrphanMedia } from '../modules/catalog/media/media-sweep';
import { S3ObjectStorage } from '../modules/catalog/media/s3-object-storage.service';

function numberFlag(args: string[], name: string, fallback: number): number {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = Number(args[index + 1]);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} needs a non-negative number`);
  return value;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const minAgeHours = numberFlag(args, '--min-age-hours', 24);
  const maxDeletions = numberFlag(args, '--max-deletions', 500);

  const storageConfig = loadStorageConfig();
  if (!storageConfig.enabled) throw new Error('S3_MEDIA_BUCKET is not set: nothing to sweep');

  const db = resolveDatabaseConfig();
  const sequelize = new Sequelize({
    dialect: 'postgres',
    host: db.host,
    port: db.port,
    database: db.name,
    username: db.user,
    password: db.password,
    logging: false,
    ...(db.ssl ? { dialectOptions: { ssl: { require: true, rejectUnauthorized: false } } } : {}),
  });

  try {
    const report = await sweepOrphanMedia(
      {
        storage: new S3ObjectStorage(storageConfig),
        findExistingMediaIds: async (ids) => {
          const rows = await sequelize.query<{ id: string }>(
            'SELECT id FROM master_product_media WHERE id = ANY(CAST(:ids AS uuid[]))',
            { type: QueryTypes.SELECT, replacements: { ids: `{${ids.join(',')}}` } },
          );
          return new Set(rows.map((r) => r.id));
        },
      },
      { apply, minAgeHours, maxDeletions },
    );

    console.log(
      JSON.stringify(
        {
          mode: apply ? 'apply' : 'dry-run',
          scanned: report.scanned,
          referenced: report.referenced,
          tooNew: report.tooNew,
          unparseable: report.unparseable.length,
          orphans: report.orphans.length,
          deleted: report.deleted,
          aborted: report.aborted,
        },
        null,
        2,
      ),
    );
    for (const key of report.unparseable) console.warn(`not ours, left alone: ${key}`);
    if (!apply) for (const key of report.orphans) console.log(`would delete: ${key}`);

    if (report.aborted) {
      console.error(
        `${report.orphans.length} orphans exceeds --max-deletions ${maxDeletions}: nothing was deleted`,
      );
      process.exitCode = 1;
    }
  } finally {
    await sequelize.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
