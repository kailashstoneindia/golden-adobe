// Creates the local media bucket in MinIO (decision 0033):
//   pnpm --filter @golden-abode/backend storage:init-local
//
// Idempotent. Local only: it refuses to run without S3_ENDPOINT so it can never
// create or change a bucket on real AWS. Values not set in the environment fall
// back to the docker-compose MinIO defaults.
import { loadStorageConfig } from '../src/config/storage.config';
import { ensureLocalBucket } from '../src/modules/catalog/media/local-bucket';
import { createS3Client } from '../src/modules/catalog/media/s3-object-storage.service';

async function main(): Promise<void> {
  const config = loadStorageConfig({
    S3_MEDIA_BUCKET: 'golden-abode-media',
    S3_ENDPOINT: 'http://localhost:9000',
    S3_FORCE_PATH_STYLE: 'true',
    S3_ACCESS_KEY_ID: 'golden_dev',
    S3_SECRET_ACCESS_KEY: 'golden_dev_secret',
    ...process.env,
  });

  if (!config.endpoint) {
    throw new Error('storage:init-local is for MinIO only: S3_ENDPOINT is not set');
  }

  await ensureLocalBucket(createS3Client(config), config.bucket);
  console.log(`bucket "${config.bucket}" ready at ${config.endpoint} (variants/* public)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
