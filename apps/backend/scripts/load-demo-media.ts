// Loads the demo product images from docs/vendor-assets into storage and records
// them against the products (decisions 0031 and 0033):
//
//   pnpm --filter @golden-abode/backend media:load-demo                 (dry run)
//   pnpm --filter @golden-abode/backend media:load-demo -- --apply
//
// Point it at a database and bucket with the usual DB_* / DATABASE_URL and S3_*
// environment variables. Safe to re-run: a product that already has an image is
// left alone.
//
// Each image is one row plus one object, exactly as an admin upload would make
// them, so the Lambda produces the WebP variants and calls the API back. The row
// is inserted BEFORE the file is uploaded: the upload is what triggers the
// Lambda, and its callback needs a row to update.
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { QueryTypes, Sequelize } from 'sequelize';

import { resolveDatabaseConfig } from '../src/config/connection-url';
import { loadStorageConfig } from '../src/config/storage.config';
import {
  Assignment,
  ImageFile,
  ProductRef,
  planDemoMedia,
} from '../src/modules/catalog/media/demo-media-plan';
import { sniffImageType } from '../src/modules/catalog/media/image-sniff';
import { originalKey, variantUrls } from '../src/modules/catalog/media/media-keys';
import { S3ObjectStorage } from '../src/modules/catalog/media/s3-object-storage.service';

// Brand names exactly as stored in the brand table.
const BRANDS = [
  { brand: 'Lavish Ceramics', imagesDir: 'lavish-ceramics/images' },
  { brand: 'Sparsh Pearl', imagesDir: 'pearl-precision/images' },
];

const UPLOAD_CONCURRENCY = 4;

// At most `limit` workers in flight; each handles its own errors.
async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const lane = async () => {
    while (next < items.length) await worker(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
}

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function findImages(dir: string): ImageFile[] {
  const found: ImageFile[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.jpe?g$/i.test(entry.name)) {
        found.push({ stem: entry.name.replace(/\.jpe?g$/i, ''), path: full });
      }
    }
  };
  walk(dir);
  return found.sort((a, b) => a.stem.localeCompare(b.stem));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const listMissing = args.includes('--list-missing');
  const waitSeconds = Number(flag(args, '--wait-seconds') ?? 120);
  const assetsDir = resolve(
    flag(args, '--assets') ?? join(__dirname, '../../../docs/vendor-assets'),
  );

  const storageConfig = loadStorageConfig();
  if (apply && !storageConfig.enabled) {
    throw new Error('S3_MEDIA_BUCKET is not set: nowhere to upload the images');
  }

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

  const storage = new S3ObjectStorage(storageConfig);
  const insertedIds: string[] = [];
  const failures: string[] = [];
  const totals = { attached: 0, skippedExisting: 0, withoutImage: 0, unusedImages: 0 };

  try {
    console.log(`${apply ? 'APPLY' : 'DRY RUN'}: database ${db.name}, assets ${assetsDir}\n`);

    for (const { brand, imagesDir } of BRANDS) {
      const images = findImages(join(assetsDir, imagesDir));

      const rows = await sequelize.query<{ id: string; mfr_part_number: string }>(
        `SELECT mp.id, mp.mfr_part_number
           FROM master_product mp
           JOIN brand b ON b.id = mp.brand_id
          WHERE b.name = :brand AND mp.mfr_part_number IS NOT NULL`,
        { type: QueryTypes.SELECT, replacements: { brand } },
      );
      const products: ProductRef[] = rows.map((r) => ({ id: r.id, partNumber: r.mfr_part_number }));

      const hasImage = new Set(
        (
          await sequelize.query<{ master_product_id: string }>(
            `SELECT DISTINCT master_product_id FROM master_product_media
              WHERE type = 'image' AND master_product_id = ANY(CAST(:ids AS uuid[]))`,
            {
              type: QueryTypes.SELECT,
              replacements: { ids: `{${products.map((p) => p.id).join(',')}}` },
            },
          )
        ).map((r) => r.master_product_id),
      );

      const plan = planDemoMedia(images, products, hasImage);
      const exact = plan.assignments.filter((a) => a.via === 'exact').length;
      console.log(
        `${brand}: ${products.length} products, ${images.length} image files\n` +
          `  will attach ${plan.assignments.length} (${exact} exact, ${plan.assignments.length - exact} via base code)\n` +
          `  already have an image: ${plan.skippedExisting.length}\n` +
          `  will still have none: ${plan.withoutImage.length}\n` +
          `  image files matching no product: ${plan.unusedImages.length}\n`,
      );
      if (listMissing) {
        for (const p of plan.withoutImage) console.log(`    no image: ${p.partNumber}`);
      }
      totals.attached += plan.assignments.length;
      totals.skippedExisting += plan.skippedExisting.length;
      totals.withoutImage += plan.withoutImage.length;
      totals.unusedImages += plan.unusedImages.length;

      if (!apply) continue;

      await runWithConcurrency(plan.assignments, UPLOAD_CONCURRENCY, async (a: Assignment) => {
        const bytes = readFileSync(a.imagePath);
        // The file's name says .jpg but its bytes decide: the vendor folders hold
        // some WebP files with a .jpg name, and the key and content type must
        // describe what is really inside.
        const contentType = sniffImageType(bytes);
        if (!contentType) {
          failures.push(`${a.partNumber}: ${a.imagePath} is not a JPEG, PNG or WebP image`);
          return;
        }
        const mediaId = randomUUID();
        const key = originalKey(a.productId, mediaId, contentType);

        try {
          await sequelize.query(
            `INSERT INTO master_product_media
               (id, master_product_id, url, type, display_order, is_primary, is_representative,
                storage_key, content_type, size_bytes, processing_status)
             VALUES (:id, :productId, :url, 'image', 0, true, false,
                     :key, :contentType, :size, 'processing')`,
            {
              replacements: {
                id: mediaId,
                productId: a.productId,
                url: variantUrls(storageConfig.publicBaseUrl, a.productId, mediaId).large,
                key,
                contentType,
                size: bytes.length,
              },
            },
          );
        } catch (error) {
          failures.push(`${a.partNumber}: could not record the image: ${String(error)}`);
          return;
        }

        try {
          await storage.put(key, bytes, contentType);
          insertedIds.push(mediaId);
        } catch (error) {
          // No file means no Lambda will ever report on this row: remove it.
          await sequelize.query('DELETE FROM master_product_media WHERE id = :id', {
            replacements: { id: mediaId },
          });
          failures.push(`${a.partNumber}: upload failed: ${String(error)}`);
        }
      });
    }

    console.log(
      `TOTAL: attach ${totals.attached}, already imaged ${totals.skippedExisting}, ` +
        `still without an image ${totals.withoutImage}, unused image files ${totals.unusedImages}`,
    );
    if (!apply) {
      console.log('\nDry run only. Re-run with --apply to upload.');
      return;
    }

    console.log(
      `\nUploaded ${insertedIds.length}. Waiting up to ${waitSeconds}s for the Lambda...`,
    );
    const deadline = Date.now() + waitSeconds * 1000;
    let counts: Record<string, number> = {};
    while (insertedIds.length > 0) {
      const result = await sequelize.query<{ processing_status: string; n: number }>(
        `SELECT processing_status, count(*)::int AS n FROM master_product_media
          WHERE id = ANY(CAST(:ids AS uuid[])) GROUP BY processing_status`,
        { type: QueryTypes.SELECT, replacements: { ids: `{${insertedIds.join(',')}}` } },
      );
      counts = Object.fromEntries(result.map((r) => [r.processing_status, r.n]));
      if (!counts.processing || Date.now() > deadline) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
    console.log(
      `ready ${counts.ready ?? 0}, failed ${counts.failed ?? 0}, still processing ${counts.processing ?? 0}`,
    );
    if (counts.processing) {
      console.log('Still processing: is the Lambda (or its local server) and the API running?');
    }
    for (const failure of failures) console.error(`FAILED ${failure}`);
    if (failures.length > 0 || counts.failed) process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
