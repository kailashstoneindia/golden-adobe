# S2: Brands API

Spec: "Brands". Needs S1. Patterns: `modules/artisans/admin-artisans.service.ts` + controller (admin CRUD, presign/confirm),
`modules/catalog/admin-catalog.controller.ts` (guards, paging).

**Endpoints** (controller `admin/brands`): `GET /`, `GET /:id`, `POST /`, `PATCH /:id`, `PATCH /:id/active` `{isActive}`,
`POST /:id/aliases` `{alias}`, `DELETE /:id/aliases/:aliasId`, `POST /:id/logo-upload-url` `{contentType}`,
`POST /:id/logo/confirm` `{key}`, `POST /:id/merge` `{intoBrandId}`.

**Produces:** `AdminBrandsService` (methods in the spec, returning `BrandDto` / `MergeBrandResultDto
{ movedProducts: number; aliasesAdded: number }`), `AdminBrandsController`, DTOs in `modules/catalog/dto/`.

## Task 1: List, get, create
- [ ] **Step 1: Failing tests** `__tests__/admin-brands.service.spec.ts`: `create` stores the four compliance fields and a slug
  `havells-india` for "Havells India"; a second brand "HAVELLS  India Ltd" (same normalized name) → 409 naming the existing
  brand; invalid email → 400; missing `manufacturerAddress` → 400; slug clash gets suffix `-2`; `list({search:'hav'})` returns it with
  `productCount`; `list({isActive:false})` filters; `get` returns `aliases`.
- [ ] **Step 2: Run** `... test -- admin-brands`. FAIL. **Step 3: Implement** service, controller, DTOs; register in `CatalogModule`.
- [ ] **Step 4: Run.** PASS. **Step 5: Commit** `Catalog: brands list, get, create (decision 0062)`.

## Task 2: Update, activate, aliases
- [ ] **Step 1: Failing tests:** `update` renames (duplicate-by-normalized-name → 409) and edits compliance fields;
  `setActive(false)` hides the brand from `list({isActive:true})` and leaves its products untouched; `addAlias('H.I.L')` then
  `BrandResolverService.resolve('h.i.l')` returns the brand; adding an alias already used by another brand → 409;
  `removeAlias` removes it; a brand with `mergedIntoId` cannot be edited or reactivated (400).
- [ ] **Step 2: Run.** FAIL. **Step 3: Implement** (use `BrandResolverService.addAlias/listAliases/removeAlias`). **Step 4: Run.** PASS.
- [ ] **Step 5: Commit** `Catalog: brand update, activation, aliases (decision 0062)`.

## Task 3: Logo
- [ ] **Step 1: Failing tests** (mock `OBJECT_STORAGE` like `artisans.service.spec.ts`): upload URL key starts `brands/<id>/logo-`;
  non-image content type → 400; `confirmLogo` rejects a foreign key prefix and a key `head()` says is missing; success sets `logoUrl`.
- [ ] **Step 2: Run.** FAIL. **Step 3: Implement** mirroring `ArtisansService.createUploadUrl/confirmDocumentUpload`
  (`artisans.service.ts:160-215`). **Step 4: Run.** PASS. **Step 5: Commit** `Catalog: brand logo (decision 0062)`.

## Task 4: Merge
- [ ] **Step 1: Failing tests:** merge moves all of the source's products to the target, adds the source name and aliases to the
  target's aliases, sets source `isActive=false` and `mergedIntoId`, writes a `catalog_merge_log` row (`entity_type 'brand'`,
  admin id, summary with the counts); afterwards `resolve('<source name>')` returns the target; a product pair colliding on
  `(brand, mfr_part_number)` aborts with 409 listing the MPNs and **nothing** moves (check counts unchanged); merge into
  itself, into an inactive brand, or from an already merged brand → 400.
- [ ] **Step 2: Run.** FAIL. **Step 3: Implement** in one transaction with `FOR UPDATE` on both brand rows.
- [ ] **Step 4: Run** catalog suite + typecheck. PASS. **Step 5: Commit** `Catalog: brand merge (decision 0062)`; tick S2.
