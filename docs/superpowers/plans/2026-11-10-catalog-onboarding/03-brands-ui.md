# S3: Brands page (admin UI)

Needs S2. Patterns: `pages/ArtisansPage.tsx` + spec, `queries/useArtisansQueries.ts`, the artisan document upload in
`pages/ArtisanVerificationPage.tsx` and `services/storage`, `routes/AppRouter.tsx`, `ROUTES` in `src/constants`,
sidebar in `components/layout/AdminLayout.tsx`. Browser-check at the end (Playwright recipe in the user's memory).

**Produces:**
- `services/api/brandsService.ts`: `list`, `get`, `create`, `update`, `setActive`, `addAlias`, `removeAlias`,
  `createLogoUploadUrl`, `confirmLogo`, `merge` (typed with `BrandDto` from `@golden-abode/types`).
- `queries/useBrandsQueries.ts`: key factory `brandKeys = { all:['brands'], list(filters), detail(id) }`; hooks `useBrandsQuery(filters)`,
  `useBrandQuery(id)`, and one mutation hook per service call; mutations invalidate `['brands']` and `['catalog']`.
- `components/catalog/BrandPicker.tsx`: `({ value: string|null, onChange(brandId: string|null), allowCreate?: boolean })`,
  a searchable select of **active** brands; `allowCreate` shows an "Add brand" row that opens the brand form in a modal and
  selects the new brand on save. Used by S6 and S9.
- `pages/BrandsPage.tsx` at `ROUTES.brands = '/catalog/brands'`; sidebar entry "Brands" under Catalog.

## Task 1: Service, hooks, list
- [ ] **Step 1: Failing tests** `queries/useBrandsQueries.spec.tsx` and `pages/BrandsPage.spec.tsx`: the list shows name, manufacturer,
  product count, Active/Inactive badge; the search box filters through the `search` param; an "Inactive" toggle shows inactive brands;
  a merged brand shows "Merged into <name>".
- [ ] **Step 2: Run** `pnpm --filter @golden-abode/admin exec vitest run src/pages/BrandsPage.spec.tsx`. FAIL.
- [ ] **Step 3: Implement.** **Step 4: Run.** PASS. **Step 5: Commit** `Catalog: brands list screen (decision 0062)`.

## Task 2: Add and edit form
- [ ] **Step 1: Failing tests:** "Add brand" requires name, manufacturer name, manufacturer address, care email, care phone and shows
  inline errors for each; a duplicate-name 409 shows the server message ("already exists as Havells"); editing a brand pre-fills and saves
  through `PATCH`; the Deactivate switch calls `PATCH /:id/active`.
- [ ] **Step 2: Run.** FAIL. **Step 3: Implement** the form (modal, same style as the artisans edit modals). **Step 4: Run.** PASS.
- [ ] **Step 5: Commit** `Catalog: brand form (decision 0062)`.

## Task 3: Aliases and logo
- [ ] **Step 1: Failing tests:** the detail view lists aliases with a remove button; adding "H.I.L" calls the API and shows the chip; a
  conflicting alias shows the 409 message; logo upload requests a presigned URL, posts the file, confirms, and shows the image.
- [ ] **Step 2: Run.** FAIL. **Step 3: Implement.** **Step 4: Run.** PASS. **Step 5: Commit** `Catalog: brand aliases and logo (decision 0062)`.

## Task 4: Merge and BrandPicker
- [ ] **Step 1: Failing tests:** "Merge into…" opens a `BrandPicker` (excluding the brand itself), shows "This moves N products and cannot be
  undone from the screen", and calls `POST /:id/merge`; a 409 collision lists the clashing part numbers; `BrandPicker` lists only active
  brands, filters as you type, and with `allowCreate` creates and selects a new brand.
- [ ] **Step 2: Run.** FAIL. **Step 3: Implement.** **Step 4: Run** the full admin suite + `tsc --noEmit`. PASS.
- [ ] **Step 5: Browser check** (Playwright, local test DB): create a brand, add an alias, upload a logo, merge two brands, confirm the
  import of a row with the old spelling now works. Clean up. **Commit** `Catalog: brand merge and picker (decision 0062)`; tick S3.
