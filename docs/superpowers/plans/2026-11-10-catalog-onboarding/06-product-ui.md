# S6: Product screens (admin UI)

Needs S3 (BrandPicker) and S5 (API). Patterns: `pages/CatalogProductsPage.tsx` + spec, `components/catalog/ProductDetailModal.tsx`,
`ProductNameEditor.tsx`, `media/ProductMediaPanel.tsx`, `queries/useCatalogQueries.ts`, `services/api/catalogService.ts`,
`types/catalog.types.ts`. Browser-check at the end.

**Produces:**
- service + hooks in the existing catalog service/queries: `getReadiness(id)`, `updateProduct(id, body)`, `retireProduct(id)`,
  `restoreProduct(id)`, `deleteProduct(id)`, `mergeProduct(id, intoProductId)`, `createProduct(body)` (and `useProductReadinessQuery(id)`
  plus one mutation hook each; mutations invalidate `['catalog']`).
- `components/catalog/ProductForm.tsx`: props `{ mode: 'create'|'edit'; productId?: string; initial?: Partial<ProductFormValues>;
  onSaved(productId: string): void }` used by this session and S9.
- `components/catalog/ReadinessChecklist.tsx`: `({ productId })` showing each check with a tick or cross and the `detail`.
- `components/catalog/MergeProductDialog.tsx`: `({ sourceId, onDone })`.
- `components/catalog/HsnPicker.tsx`: `({ value: string|null, onChange(code: string|null, gstRate: number|null): void })`, a searchable select over
  `GET /admin/catalog/hsn-codes` showing code, description and rate, with an "Add HSN code" row (code, description, GST rate) that creates and selects it.
- Route `ROUTES.catalogProductNew = '/catalog/products/new'`; a "New product" button on the products page.

## Task 1: List filters and bulk publish by brand
- [ ] **Step 1: Failing tests** (extend `CatalogProductsPage.spec.tsx`, create if missing): a brand `BrandPicker` filter sends `brandId`; the search box
  still works; "Publish all drafts of <brand>" appears when a brand filter and the Draft tab are active and calls bulk publish with `{ brandId }`;
  the result message lists skipped products with their reasons (for example "needs at least one image").
- [ ] **Step 2: Run.** FAIL. **Step 3: Implement.** **Step 4: Run.** PASS. **Step 5: Commit** `Catalog: brand filter and publish by brand (decision 0062)`.

## Task 2: Add-product form
- [ ] **Step 1: Failing tests** `ProductForm.spec.tsx`: choosing a leaf category loads its attributes and renders a field per attribute
  (enum as a dropdown, required ones starred); `BrandPicker` is used for the brand (with `allowCreate`); choosing a category pre-fills the HSN code and GST rate from the category default (`HsnPicker`; the user can change it or leave it empty, which only shows a warning in the checklist); name and country of origin
  validate on submit; saving calls `POST /admin/catalog/products`, then shows the images panel and the `ReadinessChecklist` for the new draft;
  a duplicate brand+MPN 400 shows its message inline; "Publish" is disabled until the checklist has no failed blocking check.
- [ ] **Step 2: Run.** FAIL. **Step 3: Implement** (reuse `ProductMediaPanel` after the draft exists). **Step 4: Run.** PASS.
- [ ] **Step 5: Commit** `Catalog: add-product form (decision 0062)`.

## Task 3: Edit in the product modal
- [ ] **Step 1: Failing tests** (`ProductDetailModal.spec.tsx`): an "Edit" button opens `ProductForm mode='edit'` pre-filled; category is shown but read-only;
  saving a changed brand/MPN calls `PATCH`; the modal shows the `ReadinessChecklist` for drafts; Publish is disabled while a blocking check fails.
- [ ] **Step 2: Run.** FAIL. **Step 3: Implement.** **Step 4: Run.** PASS. **Step 5: Commit** `Catalog: edit products from the modal (decision 0062)`.

## Task 4: Retire, restore, delete, merge
- [ ] **Step 1: Failing tests:** "Retire" (confirm dialog: "Active vendor listings will be paused") calls the API and the status badge becomes Retired;
  "Restore" appears on retired products; "Delete" appears only on drafts and shows the 409 "retire it instead" message when refused;
  "Merge into…" opens `MergeProductDialog` with a product search limited to the same category, explains the vendor-listing rule, and after success
  shows the result (moved listings and each paused listing with the vendor name); the Deprecated tab label is "Retired".
- [ ] **Step 2: Run.** FAIL. **Step 3: Implement.** **Step 4: Run** the full admin suite + `tsc --noEmit`. PASS.
- [ ] **Step 5: Browser check** (Playwright, local test DB): add a product with an image through the form and publish it; try to publish one without an
  image; edit the brand; merge two products; retire one. Clean up. **Commit** `Catalog: retire, delete, merge actions (decision 0062)`.

## Task 5: Category default HSN (Categories page)
Files: `pages/CatalogCategoriesPage.tsx` (+ its spec), `services/api/catalogService.ts` (`setCategoryHsnDefault(id, code|null)`), `queries/useCatalogQueries.ts`.
- [ ] **Step 1: Failing tests:** each leaf category row shows its default HSN code or "No default"; "Set default" opens `HsnPicker` and saves through
  `PATCH /admin/catalog/categories/:id`; "Clear" saves `null`; the `ReadinessChecklist` shows a missing HSN code as an amber warning, not a red blocker.
- [ ] **Step 2: Run.** FAIL. **Step 3: Implement.** **Step 4: Run** the full admin suite + `tsc --noEmit`. PASS.
- [ ] **Step 5: Browser check** (Playwright): set a default for one category, add a product there and see the HSN code pre-filled; publish it with an image and no HSN code and see
  the warning. Clean up. **Commit** `Catalog: category default HSN screen (decision 0062)`; tick S6.
