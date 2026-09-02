#!/usr/bin/env node
/**
 * Boot smoke test — `pnpm smoke` from apps/backend.
 *
 * Exists because of a real defect: the application could not boot at all for
 * several days (Vendor declared @BelongsTo(() => City) while City was absent
 * from DatabaseModule's eager model list, so every start failed with "City has
 * not been defined" and retried forever). `nest build` passed, eslint passed,
 * and all 25 Jest tests passed throughout — none of them start the app. The
 * Jest suites build their own Sequelize instance from test-db.ts with every
 * model in one list, so the broken init ordering never occurred there.
 *
 * This is deliberately a SCRIPT, not a .spec.ts: this project verifies
 * manually with throwaway scripts rather than growing the automated suite.
 * Run it after any change that adds a model, an association, a module, or a
 * queue — and in CI if you want the guarantee for free.
 *
 * It asserts the app reaches a listening state and that the routes it should
 * expose are actually mapped. It writes nothing and needs no fixtures, but it
 * does need Postgres and Redis reachable.
 */
const { NestFactory } = require('@nestjs/core');

// Routes that must exist. Add to this when a phase adds a public surface.
const REQUIRED_ROUTES = [
  { method: 'GET', path: '/api/health' },
  { method: 'GET', path: '/api/search' },
  { method: 'GET', path: '/api/admin/search/products' },
  { method: 'POST', path: '/api/admin/search/rebuild' },
  { method: 'GET', path: '/api/admin/catalog/categories' },
  { method: 'GET', path: '/api/admin/catalog/products' },
  { method: 'PATCH', path: '/api/admin/catalog/products/:productId/publish' },
  { method: 'GET', path: '/api/admin/catalog-review-queue' },
];

async function main() {
  // WORKER_MODE=api so the smoke run does not start draining the outbox as a
  // side effect of checking that the app boots.
  process.env.WORKER_MODE = 'api';

  const { AppModule } = require('../dist/app.module');

  let app;
  try {
    app = await NestFactory.create(AppModule, { logger: ['error'] });
  } catch (err) {
    console.error('FAIL  application failed to construct');
    console.error(err);
    process.exit(1);
  }

  app.setGlobalPrefix('api');
  await app.listen(0);
  const url = await app.getUrl();
  console.log(`PASS  application booted and is listening (${url})`);

  // Ask the router what it actually mapped, rather than scraping log output.
  const server = app.getHttpAdapter().getInstance();
  const mapped = new Set();
  const stack = server?._router?.stack ?? [];
  for (const layer of stack) {
    if (!layer.route) continue;
    for (const method of Object.keys(layer.route.methods)) {
      mapped.add(`${method.toUpperCase()} ${layer.route.path}`);
    }
  }

  let failed = 0;
  for (const { method, path } of REQUIRED_ROUTES) {
    const key = `${method} ${path}`;
    if (mapped.has(key)) {
      console.log(`PASS  route mapped: ${key}`);
    } else {
      console.error(`FAIL  route MISSING: ${key}`);
      failed += 1;
    }
  }

  await app.close();

  if (failed > 0) {
    console.error(`\nSMOKE FAILED — ${failed} route(s) missing`);
    process.exit(1);
  }
  console.log('\nSMOKE PASSED');
  process.exit(0);
}

main().catch((err) => {
  console.error('FAIL  smoke test threw');
  console.error(err);
  process.exit(1);
});
