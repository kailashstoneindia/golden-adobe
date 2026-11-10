# S7: Background import (API)

Spec: "Background import". Needs S1. Patterns: queue/processor wiring in
`modules/search/indexing/indexing.processor.ts` and `modules/search/search.module.ts`; storage in
`modules/catalog/media/object-storage.ts` (`OBJECT_STORAGE`: needs `put`/`get` of a buffer; if the interface lacks them, add `putObject(key, buffer, contentType)` and
`getObject(key): Promise<Buffer>` to the interface, the S3 implementation and the local test double); current sync code in
`modules/catalog/catalog-import-upload.service.ts` and `catalog-import.controller.ts`.

**Produces:**
- `CATALOG_IMPORT_QUEUE = 'catalog-import'` constant; `CatalogImportJobsService`: `enqueue(adminUserId, categoryId, buffer): Promise<{ jobId: string }>`,
  `list({page,limit}): Promise<Paginated<CatalogImportJobDto>>`, `get(jobId): Promise<CatalogImportJobDto>`, `getErrorDownloadUrl(jobId): Promise<{ url: string }>`,
  `undo(jobId): Promise<{ deleted: number; kept: number }>`.
- `CatalogImportProcessor` (BullMQ `@Processor(CATALOG_IMPORT_QUEUE)`) handling job `{ jobId }`.
- `CatalogImportUploadService.processRows(...)` extracted from `importFile` (signature chosen to take the parsed sheet, plan, leaf and an `onProgress(processed: number): Promise<void>`
  callback, and to stamp `importJobId` on created products).
- Routes: `POST /admin/catalog-import/:categoryId` → `202 { jobId }`; `GET /admin/catalog-import/jobs`; `GET .../jobs/:id`; `GET .../jobs/:id/errors`; `POST .../jobs/:id/undo`.
  (Keep `GET template/:categoryId`; declare the `jobs` routes before `:categoryId` so they are not shadowed.)

## Task 1: Extract `processRows` and stamp the job
- [ ] **Step 1: Failing tests** (extend or add `__tests__/catalog-import-upload.service.spec.ts`): `processRows` creates draft products for valid rows with `importJobId` set,
  collects row errors for invalid ones (bad enum, unknown brand, duplicate brand+MPN); a row with a blank `hsn_code` gets the category's default HSN code and its GST rate (an explicit code wins; no default leaves it blank) using `AdminCatalogService.resolveCategoryHsnDefault` from S4, calls `onProgress` at least once per 20 rows and at the end, and returns
  `{ accepted, rejected, errorWorkbook: Buffer|null, createdProductIds }`; one row failing with an unexpected database error is reported as that row's error and does not stop the rest.
- [ ] **Step 2: Run.** FAIL. **Step 3: Implement** by moving the loop and validation out of `importFile`; remove `importFile`'s synchronous use from the controller in Task 3.
- [ ] **Step 4: Run.** PASS. **Step 5: Commit** `Catalog: extract import row processing (decision 0062)`.

## Task 2: Jobs service and processor
- [ ] **Step 1: Failing tests** `__tests__/catalog-import-jobs.service.spec.ts` (BullMQ queue mocked, storage mocked): `enqueue` stores `imports/<jobId>.xlsx`, creates a `queued` job and adds a queue job
  `{ jobId }`; the processor sets `running`, updates `processedRows`, then `done` with accepted/rejected counts and, when rows were rejected, stores `imports/<jobId>-errors.xlsx` and sets `errorFileKey`;
  a corrupt workbook sets `failed` with a readable `failureMessage` (no products created); a leaf-category error sets `failed`; processing the same job twice (restart) creates no duplicate products
  (second run finds the job already `done` and exits; a `running` job resumed after restart skips rows whose product code already exists via the existing brand+MPN duplicate rule and reports them).
  `undo` deletes the job's products that are `draft` with no listings, keeps the rest, sets `undoneAt`, and a second undo → 400.
- [ ] **Step 2: Run.** FAIL. **Step 3: Implement** and register the queue with `BullModule.registerQueue` in `CatalogModule` (mirror `SearchModule`). **Step 4: Run.** PASS.
- [ ] **Step 5: Commit** `Catalog: background import jobs (decision 0062)`.

## Task 3: Endpoints
- [ ] **Step 1: Failing tests** (`__tests__/catalog-import.controller.spec.ts`, HTTP level like `artisans-test-app.ts`): upload of a valid `.xlsx` → 202 with `jobId`; a non-xlsx → 400; a file over
  20 MB → 413; `GET jobs` is paged newest first and includes `createdByName`; `GET jobs/:id` returns progress; `GET jobs/:id/errors` → 404 when no errors, otherwise a URL; all routes 403 for non-admins.
- [ ] **Step 2: Run.** FAIL. **Step 3: Implement** (`FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } })`). **Step 4: Run** catalog suite + typecheck. PASS.
- [ ] **Step 5: Commit** `Catalog: import job endpoints (decision 0062)`; tick S7.
