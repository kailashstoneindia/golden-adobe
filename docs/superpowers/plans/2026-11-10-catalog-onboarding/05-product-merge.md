# S5: Product merge

Spec: "Products → Merge", decision 0062 (conflict rule). Needs S4. Pattern for locking and cached price recompute:
`modules/catalog/stock.service.ts`. Tables touched: `vendor_listing`, `vendor_product_map`, `master_product_media`,
`master_product`, `catalog_merge_log`.

**Produces:** `ProductMergeService.merge(adminUserId: string, fromProductId: string, intoProductId: string):
Promise<MergeResultDto>`; route `POST /admin/catalog/products/:id/merge` body `{ intoProductId }` (DTO `MergeProductDto`).

- [ ] **Step 1: Write failing tests** `__tests__/product-merge.service.spec.ts` (real DB via `test-db.ts`; seed two vendors, two products in one category):
  1. a listing only on the source is re-pointed to the target (same listing id) and `movedListings === 1`;
  2. vendor V sells both: V's source listing becomes `paused`, stays on the source product, appears in `pausedListings` with the vendor name,
     V's target listing is untouched, no listing row is deleted (row count unchanged);
  3. `vendor_product_map` rows move to the target;
  4. media move to the target only when the target has none (`mediaMoved`), otherwise stay;
  5. the source ends `deprecated` with `mergedIntoId` and `mergedAt`; a `catalog_merge_log` row (`entity_type 'product'`, admin id, summary) exists;
  6. past `order_items` still point at the source product id;
  7. different categories → 400; source or target already `deprecated` → 400; merge into itself → 400;
  8. the target's cached best price reflects a moved cheaper listing.
- [ ] **Step 2: Run** `... test -- product-merge`. Expected: FAIL.
- [ ] **Step 3: Implement** in one transaction with `FOR UPDATE` on both product rows (lock in id order to avoid deadlock). Detect the
  clash with the unique key `(vendor_id, COALESCE(stated_grade,''))` among the target's listings before updating each source listing.
  Recompute the target's cached best price/listing id with the same helper `StockService` uses.
- [ ] **Step 4: Run** catalog suite + typecheck. Expected: PASS.
- [ ] **Step 5: Commit** `Catalog: merge duplicate products (decision 0062)`; tick S5.
