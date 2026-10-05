// Local stand-in for "S3 triggers the Lambda" (decision 0033):
//
//   pnpm --filter @golden-abode/media-lambda dev
//
// MinIO is configured to POST its upload events here. The request is answered
// straight away and processed in the background, because S3 does not make the
// uploader wait for the Lambda either. Retries are emulated, which matters: the
// Lambda can finish before the admin's confirm request commits, the API then
// answers 404, and the real Lambda is retried by S3 a minute later. Locally the
// delays are short so the same race resolves in seconds.
import http from 'node:http';

import { sendResult } from '../callback';
import { loadConfig } from '../config';
import { createHandler, type S3Event } from '../handler';
import { createS3Store } from '../s3';

// Local defaults, applied only here (never in the Lambda itself). Anything set in
// the environment or the root .env wins.
const env: Record<string, string | undefined> = {
  S3_ENDPOINT: 'http://localhost:9000',
  S3_FORCE_PATH_STYLE: 'true',
  S3_ACCESS_KEY_ID: 'golden_dev',
  S3_SECRET_ACCESS_KEY: 'golden_dev_secret',
  API_CALLBACK_BASE_URL: 'http://localhost:3000',
  MEDIA_CALLBACK_SECRET: 'local_dev_media_callback_secret_change_me',
  ...process.env,
};

const port = Number(env.MEDIA_LAMBDA_PORT ?? 3100);
const retryDelaysMs = (env.LOCAL_RETRY_DELAYS_MS ?? '3000,6000')
  .split(',')
  .map((v) => Number(v.trim()))
  .filter((v) => Number.isFinite(v) && v >= 0);

const config = loadConfig(env);
const handler = createHandler({
  store: createS3Store(env),
  config,
  notify: (mediaId, result) => sendResult(config, mediaId, result),
});

// The deployed function is capped (reserved concurrency, see the runbook). Without
// a cap here, a bulk upload would start hundreds of image jobs at once on one
// machine, starving the callbacks until they time out and are retried.
const concurrency = Number(env.LOCAL_CONCURRENCY ?? 4);

type Job = { event: S3Event; attempt: number };
const queue: Job[] = [];
let running = 0;

function pump(): void {
  while (running < concurrency && queue.length > 0) {
    const job = queue.shift()!;
    running++;
    void run(job).finally(() => {
      running--;
      pump();
    });
  }
}

async function run({ event, attempt }: Job): Promise<void> {
  try {
    await handler(event);
  } catch (error) {
    if (attempt >= retryDelaysMs.length) {
      console.error(JSON.stringify({ event: 'gave-up', error: String(error) }));
      return;
    }
    console.warn(JSON.stringify({ event: 'retrying', attempt: attempt + 1, error: String(error) }));
    // The wait happens outside the pool, so a failing event never holds a slot.
    setTimeout(() => {
      queue.push({ event, attempt: attempt + 1 });
      pump();
    }, retryDelaysMs[attempt]);
  }
}

function enqueue(event: S3Event): void {
  queue.push({ event, attempt: 0 });
  pump();
}

http
  .createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200).end('ok');
      return;
    }
    if (req.method !== 'POST' || req.url !== '/events') {
      res.writeHead(404).end();
      return;
    }

    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      res.writeHead(200).end('ok');
      try {
        const event = JSON.parse(Buffer.concat(chunks).toString('utf8')) as S3Event;
        enqueue(event);
      } catch (error) {
        console.error(JSON.stringify({ event: 'bad-request', error: String(error) }));
      }
    });
  })
  .listen(port, () => {
    console.log(
      `media lambda (local) listening on :${port}, callbacks to ${config.apiCallbackBaseUrl}`,
    );
  });
