# S9: Create a product from a review-queue row

Spec: "Review queue". Needs S6 (`ProductForm`, `BrandPicker`). Files: `modules/catalog/catalog-review-queue.controller.ts` (+ its service, find with
`grep -rn "ReviewQueue" apps/backend/src`), `models/catalog-import-row.model.ts`, admin `pages/CatalogReviewQueuePage.tsx`.

**Produces:** `GET /admin/catalog-review-queue/:importRowId/prefill` returning `ReviewRowPrefillDto { name: string; brandText: string|null;
suggestedBrandId: string|null; categoryId: string|null; attributeValues: Record<string,string|number|boolean>; vendorName: string }`
(add to `catalog-admin.types.ts`); in the admin, a "Create product from this row" button.

## Task 1: Prefill endpoint
- [ ] **Step 1: Failing tests** (`__tests__/catalog-review-queue.prefill.spec.ts`): a staged "no candidates" row yields its name, brand text, category and attributes;
  `suggestedBrandId` is set when `BrandResolverService.resolve(brandText)` finds a brand (including through an alias or a merge) and null otherwise;
  an unknown row id → 404; a row that is not `needs_review` → 400.
- [ ] **Step 2: Run.** FAIL. **Step 3: Implement.** **Step 4: Run.** PASS. **Step 5: Commit** `Catalog: review row prefill (decision 0062)`.

## Task 2: Admin flow
- [ ] **Step 1: Failing tests** (`CatalogReviewQueuePage.spec.tsx`): rows with no candidates show "Create product from this row"; clicking opens `ProductForm mode='create'` pre-filled
  from the prefill call with the suggested brand selected (or the picker empty, with "Add brand" available when `brandText` had no match); after save the page calls the existing
  `link` mutation with the new product id and the row leaves the queue; if linking fails, the page says the product was created but not linked and offers "Link now".
- [ ] **Step 2: Run.** FAIL. **Step 3: Implement**; update the helper text that currently says "add the product through import". **Step 4: Run** admin suite + typecheck. PASS.
- [ ] **Step 5: Commit** `Catalog: create product from review row (decision 0062)`; tick S9.
