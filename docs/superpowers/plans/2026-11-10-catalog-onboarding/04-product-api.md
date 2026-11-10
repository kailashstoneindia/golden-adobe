# S4: Product API (edit, retire, delete, readiness, publish rules)

Spec: "Products". Needs S1. Files: `modules/catalog/admin-catalog.service.ts` (`updateProduct` ~581, `setProductStatus` ~411,
`bulkPublish` ~441, constraint mapping ~704-730), `admin-catalog.controller.ts`, `dto/update-product.dto.ts`,
`dto/bulk-publish-products.dto.ts`. Tests: extend `__tests__/admin-catalog.product-edit.spec.ts`; new specs named below.

**Produces:** `ProductReadinessService.getReadiness(productId: string): Promise<ProductReadinessDto>` in
`modules/catalog/product-readiness.service.ts`; routes `GET /admin/catalog/products/:id/readiness`,
`PATCH .../:id/retire`, `PATCH .../:id/restore`, `DELETE .../:id`; `GET /admin/catalog/products` accepts `brandId`;
`bulkPublish` result gains `skipped: { productId: string; productCode: string; reasons: string[] }[]`.

## Task 1: Readiness
- [ ] **Step 1: Failing tests** `__tests__/product-readiness.service.spec.ts`: a draft with image + HSN + all starred attributes →
  `ready: true`; no media → `image` check `passed:false, blocking:true`; null `hsnCode` → the `hsn_code` check fails with `blocking:false` and `ready` stays true; a missing starred attribute →
  `required_attributes` fails with `detail` naming it (use the same starred-column rule as `CatalogImportTemplateService`); no active
  listing → `listing` fails but `blocking:false` and `ready` stays true.
- [ ] **Step 2: Run** `... test -- product-readiness`. FAIL. **Step 3: Implement** service and the GET route. **Step 4: Run.** PASS.
- [ ] **Step 5: Commit** `Catalog: product readiness checks (decision 0062)`.

## Task 2: Publish enforces readiness
- [ ] **Step 1: Failing tests** (`admin-catalog.product-detail.spec.ts` or a new `admin-catalog.publish.spec.ts`): `setProductStatus(id,'live')`
  on a product with no image → 400 whose message lists the unmet checks (`needs at least one image`, ...); a product with an image and no HSN code publishes;
  with all checks met → live; unpublish (`'draft'`) is never blocked; `bulkPublish({productIds:[a,b]})` where `a` is ready and `b` has no image
  publishes `a`, returns `skipped:[{productId:b, reasons:[...]}]` and does not throw.
- [ ] **Step 2: Run.** FAIL. **Step 3: Implement** (call `getReadiness` before the status update; keep the existing variant-attribute trigger mapping).
- [ ] **Step 4: Run.** PASS. **Step 5: Commit** `Catalog: publish requires an image (decision 0062)`.

## Task 3: Edit every field except category
- [ ] **Step 1: Failing tests:** `updateProduct` with `brandId` of an active brand re-points the brand; deactivated or merged brand → 400;
  `mfrPartNumber` change colliding with another product of the same brand → 400 `a product with this brand and MPN already exists`;
  `gtin` collision → 400; `hsnCode` change copies the new code's `gst_rate`; unknown `hsnCode` → 400 naming it; `categoryId` in the body → 400;
  `name` change leaves `slug` and `productCode` unchanged; editing a **live** product keeps it live.
- [ ] **Step 2: Run.** FAIL. **Step 3: Implement** (extend `UpdateProductDto` with the new optional fields and `@IsUUID()/@IsString()` rules;
  reuse the existing constraint-to-message mapping). **Step 4: Run.** PASS. **Step 5: Commit** `Catalog: edit all product fields (decision 0062)`.

## Task 4: Retire, restore, delete
- [ ] **Step 1: Failing tests:** `retire` sets `deprecated` and sets every `active` listing of the product to `paused` in the same
  transaction (check both); retiring an already retired product → 400; `restore` returns it to `draft` (never straight to live);
  `delete` of a draft with no listings/orders/import-row links removes the row, its media rows and storage objects; delete of a live product,
  or of a draft with one listing, → 409 `retire it instead`.
- [ ] **Step 2: Run.** FAIL. **Step 3: Implement.** **Step 4: Run.** PASS. **Step 5: Commit** `Catalog: retire, restore, delete products (decision 0062)`.

## Task 5: Brand filter on the list
- [ ] **Step 1: Failing tests:** `listProducts({brandId})` returns only that brand's products; `search` also matches the brand name;
  `brandId` combined with `status` and `categoryId` works.
- [ ] **Step 2: Run.** FAIL. **Step 3: Implement** in `list-products-query.dto.ts` and `listProducts`. **Step 4: Run** catalog suite + typecheck. PASS.
- [ ] **Step 5: Commit** `Catalog: filter products by brand (decision 0062)`.

## Task 6: HSN codes and category defaults
Spec: "HSN codes and category defaults". Files: `admin-catalog.controller.ts`/`admin-catalog.service.ts` (`createProduct`, `listCategoryTree` ~line 61),
the HSN model (find with `grep -rn "hsn_code" apps/backend/src/modules/catalog/models`), `models/category.model.ts` (`hsnCodeDefault` exists).
**Produces:** `GET /admin/catalog/hsn-codes?search=`, `POST /admin/catalog/hsn-codes`, `PATCH /admin/catalog/categories/:id`
`{ hsnCodeDefault }`, `AdminCatalogService.resolveCategoryHsnDefault(categoryId: string): Promise<string | null>`; the category tree node gains
`hsnCodeDefault: string | null`; `createProduct` fills a blank `hsnCode`.
- [ ] **Step 1: Failing tests** (`__tests__/admin-catalog.hsn.spec.ts`): the list matches by code prefix `"69"` and by description text (case-insensitive), max 50;
  `POST` creates a code; duplicate → 409; code `"12"` or `"abc"` → 400; `gstRate` 150 → 400; `PATCH` sets a category default, clears it with `null`, and an
  unknown HSN code → 400; `resolveCategoryHsnDefault` returns the leaf default, else the nearest ancestor's, else null; `createProduct` without `hsnCode`
  under a category with a default stores that code and its GST rate; an explicit `hsnCode` wins; with no default and no code the product is created with a null HSN;
  `updateProduct` never overwrites an existing HSN code from a category default.
- [ ] **Step 2: Run** `... test -- admin-catalog.hsn`. FAIL. **Step 3: Implement.** **Step 4: Run** catalog suite + typecheck. PASS.
- [ ] **Step 5: Commit** `Catalog: HSN codes and category defaults (decision 0062)`; tick S4.
