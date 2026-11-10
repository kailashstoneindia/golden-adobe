# Catalog onboarding: technical design

- **Product decisions:** [0062](../../decisions/0062-catalog-onboarding-design.md) (read first)
- **Findings being fixed:** [0061](../../decisions/0061-catalog-onboarding-review.md)
- **Plan:** [../plans/2026-11-10-catalog-onboarding/00-README.md](../plans/2026-11-10-catalog-onboarding/00-README.md)
- All endpoints are `@Roles(Role.ADMIN)`. Code lives in `apps/backend/src/modules/catalog/` unless stated.

## Data changes (one migration, `20261111090000-catalog-onboarding-schema.js`)

| Table | Change |
|---|---|
| `brand` | `merged_into_id uuid null → brand` |
| `master_product` | `merged_into_id uuid null → master_product`, `merged_at timestamptz null`, `import_job_id uuid null → catalog_import_job` |
| `catalog_import_job` (new) | `id`, `category_id → category`, `created_by → users`, `file_key`, `status` (`queued\|running\|done\|failed`), `total_rows int default 0`, `processed_rows int default 0`, `accepted_count int default 0`, `rejected_count int default 0`, `error_file_key null`, `failure_message null`, `undone_at null`, `created_at`, `finished_at null` |
| `catalog_merge_log` (new) | `id`, `entity_type` (`brand\|product`), `from_id`, `into_id`, `admin_user_id → users`, `summary jsonb`, `created_at` |

## Shared types (`packages/types/src/catalog-admin.types.ts`, exported from `index.ts`)

```ts
BrandDto { id; name; slug; logoUrl: string|null; manufacturerName; manufacturerAddress;
  consumerCareEmail; consumerCarePhone; isActive: boolean; mergedIntoId: string|null;
  productCount: number; aliases: string[] }
ProductReadinessDto { ready: boolean; checks: { code: 'image'|'hsn_code'|'required_attributes'|'listing';
  label: string; blocking: boolean; passed: boolean; detail?: string }[] }
CatalogImportJobDto { id; categoryId; categoryPath; status: 'queued'|'running'|'done'|'failed';
  totalRows; processedRows; acceptedCount; rejectedCount; hasErrorFile: boolean;
  createdAt; finishedAt: string|null; createdByName: string; undone: boolean }
MergeResultDto { movedListings: number; movedMappings: number; mediaMoved: boolean;
  pausedListings: { listingId: string; vendorName: string; reason: string }[] }
```

## Brands

- `BrandResolverService.resolve(name)` follows `merged_into_id` to the final brand. Callers (`catalog-import-upload`,
  `AdminCatalogService.createProduct`) use it instead of `findOne({where:{name}})`, and reject a brand with
  `isActive = false` ("brand X is deactivated").
- `AdminBrandsService`: `list({search,isActive,page,limit})`, `get(id)`, `create(dto)`, `update(id,dto)`,
  `setActive(id, isActive)`, `addAlias(id, text)`, `removeAlias(id, aliasId)`, `createLogoUploadUrl(id, contentType)`,
  `confirmLogo(id, key)`, `merge(adminUserId, fromId, intoId)`.
- Create rules: name unique by `normalize_brand_name()` (409 naming the existing brand); slug generated from the
  name with a numeric suffix on clash; email valid; phone matches `^\+?[0-9 ()-]{7,20}$`; the four compliance
  fields are required.
- Merge: one transaction. Re-point `master_product.brand_id`; add the source name and aliases as aliases of the
  target; set source `is_active=false`, `merged_into_id`. If any moved product would collide on
  `(brand_id, mfr_part_number)` with a product already on the target, abort with 409 listing the pairs (admin merges
  those products first). Write a `catalog_merge_log` row. Source and target must differ; target must be active.
- Logo key: `brands/<brandId>/logo-<uuid>.<ext>` (jpeg/png/webp), presign + confirm like
  `ArtisansService.createUploadUrl/confirmDocumentUpload`.

## Products

- **Edit** (`PATCH /admin/catalog/products/:id`): `UpdateProductDto` gains `brandId`, `mfrPartNumber`, `gtin`,
  `hsnCode`, `gstRate`, `countryOfOrigin`, `importerDetails` (plus existing `name`, `attributeValues`). Category is
  not editable (400). Setting `hsnCode` copies that code's `gst_rate` (decision 0010) unless `gstRate` is also sent.
  Constraint violations (brand+MPN, GTIN) return friendly 400s via the existing constraint mapping. Product code and
  slug never change. Search sync is handled by the existing triggers.
- **Readiness** `ProductReadinessService.getReadiness(productId): Promise<ProductReadinessDto>`. Checks:
  `image` (blocking, at least one `master_product_media` row), `hsn_code` (NOT blocking: a warning until invoicing exists), `required_attributes`
  (blocking, every attribute the import template stars for the category has a value), `listing` (not blocking,
  at least one active vendor listing). `GET /admin/catalog/products/:id/readiness`.
- **Publish** (`setProductStatus` and `bulkPublish`) enforces every blocking check; a failure returns 400 naming the
  unmet checks; bulk publish skips such rows and reports each with its reasons.
- **Retire** `PATCH /admin/catalog/products/:id/retire` → status `deprecated`; pauses the product's active listings in
  the same transaction. `PATCH .../restore` → `draft`.
- **Delete** `DELETE /admin/catalog/products/:id`: only `draft` with no `vendor_listing`, no `order_items`, no
  `catalog_import_row` link; otherwise 409 "retire it instead". Deletes media rows and storage objects (use `MediaService.remove`).
- **Merge** `POST /admin/catalog/products/:id/merge` body `{ intoProductId }`: both in the same category, source not
  `deprecated`, target not `deprecated`. One transaction with row locks on both products:
  re-point each source `vendor_listing.master_product_id` to the target, except where the unique key
  `(vendor_id, master_product_id, COALESCE(stated_grade,''))` would clash, in which case the **source listing is
  paused** and reported; re-point `vendor_product_map`; move media only if the target has none; set source
  `deprecated`, `merged_into_id`, `merged_at`; recompute target cached best price the way `StockService` does; write a
  `catalog_merge_log` row. Past `order_items` are not touched.
- **List**: `GET /admin/catalog/products` gains `brandId`; the search box also matches brand name.

## HSN codes and category defaults

- `GET /admin/catalog/hsn-codes?search=` returns up to 50 `{ code, description, gstRate }` matching code prefix or description.
- `POST /admin/catalog/hsn-codes` `{ code, description, gstRate }` adds a code (digits only, 4 to 8; rate 0 to 100; duplicate
  code 409). The client's accountant supplies real values; none are pre-loaded.
- `PATCH /admin/catalog/categories/:id` `{ hsnCodeDefault: string|null }` sets or clears `category.hsn_code_default`
  (existing column, currently empty and unread). The category tree response includes it.
- Effective default for a product = its leaf category's default, else the nearest ancestor's. When a product is **created**
  (form or import) with a blank HSN code, it gets the effective default and that code's GST rate. An explicit code wins. Edits
  never silently overwrite an HSN code.

## Background import

- Queue `catalog-import` on BullMQ (same setup as `search/indexing/indexing.processor.ts`); processor
  `CatalogImportProcessor`.
- `POST /admin/catalog-import/:categoryId` (multipart, 20 MB limit, `.xlsx` only) stores the file under
  `imports/<jobId>.xlsx` in object storage, creates a `catalog_import_job` (`queued`), enqueues, returns
  `202 { jobId }`.
- The processor reuses the existing row validation and `createDraftProduct` (extracted from
  `CatalogImportUploadService.importFile` into `processRows(sheet, plan, leaf, onProgress)`), sets
  `master_product.import_job_id` on each product it creates, updates `processed_rows` every 20 rows, writes the
  error workbook to `imports/<jobId>-errors.xlsx`, then sets `done` (or `failed` with `failure_message`).
- Endpoints: `GET /admin/catalog-import/jobs` (paged history), `GET .../jobs/:id`, `GET .../jobs/:id/errors`
  (presigned download URL), `POST .../jobs/:id/undo` (deletes the job's products that are still `draft` with no
  listings; sets `undone_at`; returns counts deleted and kept).
- Admin screen polls `GET jobs/:id` every 2 s while `queued`/`running`.

## Review queue

- `GET /admin/catalog-review-queue/:importRowId/prefill` returns `{ name, brandText, suggestedBrandId|null,
  categoryId, attributeValues, vendorName }` from the staged row and `BrandResolverService`.
- The admin screen opens the add-product form with these values; on save it creates the draft product and then calls
  the existing `link` endpoint to attach the row.

## Bulk images

- `POST /admin/catalog/products/lookup-codes` body `{ keys: string[]; brandId?: string }` matches each key against
  `product_code` or `mfr_part_number` (case-insensitive; `brandId` limits part-number matches to one brand) and returns
  `{ items: { key; productId; matchedBy: 'code'|'mpn'; hasPrimary; status }[]; ambiguousKeys: string[] }`. A part number that
  matches products of several brands is ambiguous unless `brandId` is given.
- The admin screen takes many files named `<key>.<ext>` or `<key>_<n>.<ext>` (key = product code or part number), with an optional
  brand picker, matches them through the lookup, uploads each through the existing media presign/confirm flow (4 at a time)
  and reports unmatched and ambiguous files.

## Admin screens

Brands page (list, form, aliases, logo, merge); products list with brand filter and bulk publish by brand;
add/edit-product form with image upload and readiness checklist; product modal actions (retire, restore, delete,
merge); import page with history, live progress, rejected-rows download, undo; review queue "create from row";
bulk image dialog.
