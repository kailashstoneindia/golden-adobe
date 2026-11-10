# S10: Bulk image upload by product code or part number

Spec: "Bulk images". Needs S6 (and S3's `BrandPicker`). Product codes are only created at import, so brand staff will usually name files by the brand's own part number;
both are supported. Files: backend `admin-catalog.controller.ts`/`admin-catalog.service.ts`; admin `components/catalog/media/` (reuse the upload helper used by
`MediaUploader.tsx` and `services/api/mediaService.ts`), products page.

**Produces:**
- `POST /admin/catalog/products/lookup-codes` body `{ keys: string[]; brandId?: string }` (max 500 keys, DTO `LookupProductKeysDto`) returning
  `{ items: { key: string; productId: string; matchedBy: 'code'|'mpn'; hasPrimary: boolean; status: string }[]; ambiguousKeys: string[] }`
  (keys that match nothing are simply absent).
- `components/catalog/media/bulkImageNames.ts`: `parseImageFilename(name: string): { candidates: { key: string; order: number }[] } | null`.
  Rule: take the file stem; candidate 1 is the whole stem (order 1); if the stem ends in `_<digits>`, candidate 2 is the stem without that suffix with that number as the order.
  Non-image extensions (anything other than jpg, jpeg, png, webp) return null.
- `BulkImageDialog` opened from the products page.

## Task 1: Lookup endpoint
- [ ] **Step 1: Failing tests** (`__tests__/admin-catalog.lookup.spec.ts`): `GA-0110919` returns its product with `matchedBy:'code'`; an MPN returns `matchedBy:'mpn'`;
  matching is case-insensitive; an MPN shared by products of two brands lands in `ambiguousKeys`, and with `brandId` it resolves to that brand's product; unknown keys are omitted;
  more than 500 keys → 400; retired products are returned with `status:'deprecated'`.
- [ ] **Step 2: Run** `... test -- admin-catalog.lookup`. FAIL. **Step 3: Implement.** **Step 4: Run.** PASS. **Step 5: Commit** `Catalog: product key lookup (decision 0062)`.

## Task 2: Filename parser and dialog
- [ ] **Step 1: Failing tests** (`bulkImageNames.spec.ts`, `BulkImageDialog.spec.tsx`): parser: `GA-0110919.jpg` → one candidate `GA-0110919` order 1; `GA-0110919_2.png` → candidates
  `GA-0110919_2` (order 1) and `GA-0110919` (order 2); `ZZR_001_3.webp` → candidates `ZZR_001_3` and `ZZR_001`; `notes.txt` → null. Dialog: accepts many files; an optional `BrandPicker`
  ("These file names are part numbers of brand…") is sent as `brandId`; the preview table shows file, matched product name or "No match" or "Matches several brands", and "Will become
  primary" when the product has none; unmatched, ambiguous and retired-product files are skipped; matched files upload 4 at a time through the existing presign/confirm flow with per-file
  success or error; it ends with "N uploaded, M skipped".
- [ ] **Step 2: Run.** FAIL. **Step 3: Implement** (try each candidate against the lookup results in order; the first one that matches wins). **Step 4: Run** the full admin suite + `tsc --noEmit`. PASS.
- [ ] **Step 5: Browser check** (Playwright): drop files named by product code and by part number for two products plus one unmatched file; confirm images appear in the product modal.
  Clean up. **Commit** `Catalog: bulk image upload (decision 0062)`; tick S10.
