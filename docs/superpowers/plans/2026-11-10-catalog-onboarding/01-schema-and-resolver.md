# S1: Schema and brand resolver

Spec: "Data changes", "Brands" (resolver bullet). Create branch `feat/catalog-onboarding` from `main` first.

## Task 1: Migration, models, shared types

**Files:** Create `apps/backend/database/migrations/20261111090000-catalog-onboarding-schema.js`,
`modules/catalog/models/catalog-import-job.model.ts`, `models/catalog-merge-log.model.ts`,
`packages/types/src/catalog-admin.types.ts`; Modify `models/brand.model.ts`, `models/master-product.model.ts`,
`modules/catalog/catalog.module.ts` (register models), `packages/types/src/index.ts`.
Test: `modules/catalog/__tests__/catalog-onboarding-schema.spec.ts` (real DB; copy the setup from
`modules/catalog/__tests__/test-db.ts` and `master-product.model.spec.ts`).

**Produces:** columns and tables exactly as the spec's table; model classes `CatalogImportJob`, `CatalogMergeLog`;
`Brand.mergedIntoId`, `MasterProduct.mergedIntoId/mergedAt/importJobId`; the shared types listed in the spec
(write `MergeResultDto` as `{ movedListings: number; movedMappings: number; mediaMoved: boolean;
pausedListings: { listingId: string; vendorName: string; reason: string }[] }`).

- [ ] **Step 1: Write the failing test.** (a) a `catalog_import_job` row with `status='queued'` saves and reloads with
  `processedRows === 0`; (b) a `catalog_merge_log` row with `entity_type='brand'` saves; (c) `brand.merged_into_id` and
  `master_product.merged_into_id` accept a valid id and reject an unknown one (FK error); (d) `master_product.import_job_id`
  accepts a job id.
- [ ] **Step 2: Run** `... test -- catalog-onboarding-schema`. Expected: FAIL.
- [ ] **Step 3: Implement** migration, models, types. `down` drops the tables then the columns.
- [ ] **Step 4: Run** the migration, the test, then `tsc --noEmit` for backend and admin. Expected: PASS.
- [ ] **Step 5: Commit** `Catalog: onboarding schema, models and shared types (decision 0062)`.

## Task 2: Resolver follows merges; callers use it and reject inactive brands

**Files:** Modify `modules/catalog/brand-resolver.service.ts`, `catalog-import-upload.service.ts` (the three
`brandModel.findOne({where:{name}})` calls, near lines 271, 311, 354), `admin-catalog.service.ts` (`createProduct`,
near line 523). Test: new `__tests__/brand-resolver.service.spec.ts`; extend `admin-catalog.product-edit.spec.ts`
or the import upload spec for the caller behaviour.

**Produces:** `BrandResolverService.resolve(typedName): Promise<Brand | null>` now returns the final brand after following
`mergedIntoId` (max 5 hops, then null with a logged error); `BrandResolverService.listAliases(brandId): Promise<BrandAlias[]>`
and `removeAlias(brandId: string, aliasId: string): Promise<void>` (used by S2).

- [ ] **Step 1: Write failing tests.** Resolver: `"HAVELLS"` and `"havells ltd"` both resolve to the brand named `Havells`;
  an alias resolves; a brand whose `mergedIntoId` points at another resolves to the target; a merge cycle returns null.
  Import: a row with brand `havells ltd` is accepted and links to Havells; a row with a deactivated brand is rejected with
  `brand "X" is deactivated`. `createProduct` with brand `HAVELLS` succeeds; with a deactivated brand returns 400.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Inject `BrandResolverService` into `CatalogImportUploadService` and `AdminCatalogService`
  (it is already provided and exported by `CatalogModule`). Replace each exact-name lookup. Update the unresolved-brand
  message to `brand "X" is not in the catalog. Add it on the Brands page first, then re-upload` (the Brands page arrives in S3).
- [ ] **Step 4: Run** the catalog suite and typecheck. Expected: PASS.
- [ ] **Step 5: Commit** `Catalog: resolve brand names through the resolver everywhere (decision 0062)`; tick S1.
