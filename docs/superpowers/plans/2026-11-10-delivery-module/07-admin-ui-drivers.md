# S7: Admin UI, drivers and vehicles

Needs S3 (API) and `packages/types` types from S3. App: `apps/admin` (React, TanStack Query, vitest).
Patterns to copy: `pages/ArtisansPage.tsx` (+ `ArtisansPage.spec.tsx`), `queries/useArtisansQueries.ts`,
`services/api/` artisans service, `routes/AppRouter.tsx`, the `ROUTES` constant in `src/constants`, the sidebar in
`components/layout`. Verify in a browser per the repo practice (local Playwright, backend + admin on spare ports).

**Produces:**
- `services/api/deliveryService.ts` with `vehicles.{list,create,update}`, `drivers.{list,get,create,update,createDocumentUploadUrl,confirmDocument}` (typed with the S3 DTOs).
- `queries/useDeliveryQueries.ts` with key factory `deliveryKeys = { drivers, driver(id), vehicles }` and hooks
  `useDriversQuery`, `useDriverQuery(id)`, `useCreateDriverMutation`, `useUpdateDriverMutation`, `useVehiclesQuery`,
  `useCreateVehicleMutation`, `useUpdateVehicleMutation`. Mutations invalidate `['delivery']` keys.
- `pages/DriversPage.tsx` at `ROUTES.drivers = '/drivers'`; sidebar entry "Drivers".

## Task 1: Service and query hooks
- [ ] **Step 1: Failing tests** `queries/useDeliveryQueries.spec.tsx` (pattern `useArtisansQueries.spec.tsx`): `useCreateDriverMutation`
  posts to `/admin/drivers` and invalidates `["delivery"]`; `useDriversQuery` calls `GET /admin/drivers`.
- [ ] **Step 2: Run** `pnpm --filter @golden-abode/admin exec vitest run src/queries/useDeliveryQueries.spec.tsx`. FAIL.
- [ ] **Step 3: Implement** service + hooks. **Step 4: Run.** PASS. **Step 5: Commit** `Delivery: admin driver queries (decision 0060)`.

## Task 2: Drivers list and create form
- [ ] **Step 1: Failing tests** `pages/DriversPage.spec.tsx`: lists drivers with name, phone, helper, vehicle registration, and an
  Active/Inactive badge; "Add driver" opens a form requiring name, phone (`+91` format validation message), licence number;
  helper name without helper phone shows an inline error and does not submit; successful submit closes the form and shows the new row.
- [ ] **Step 2: Run.** FAIL. **Step 3: Implement** the page (table + modal form, same look as `ArtisansPage`). Add the route and sidebar link.
- [ ] **Step 4: Run.** PASS. **Step 5: Commit** `Delivery: drivers page (decision 0060)`.

## Task 3: Driver detail (edit, documents, vehicle)
- [ ] **Step 1: Failing tests:** opening a row shows licence number, helper, assigned vehicle (select of active vehicles with "None");
  saving calls `PATCH /admin/drivers/:id`; "Upload licence" and "Upload Aadhaar" request a presigned URL, post the file to S3, then call
  confirm (mock the storage service the way `ArtisanVerificationPage.spec.tsx` does) and the page then shows a "View" link from `*DocViewUrl`;
  the Deactivate switch calls the existing `PATCH /admin/users/:id/active`.
- [ ] **Step 2: Run.** FAIL. **Step 3: Implement** a drawer/modal reusing the upload helper in `services/storage`. **Step 4: Run.** PASS.
- [ ] **Step 5: Commit** `Delivery: driver detail and documents (decision 0060)`.

## Task 4: Vehicles tab
- [ ] **Step 1: Failing tests:** a "Vehicles" tab on `DriversPage` lists registration, type, active; "Add vehicle" requires registration number and type;
  a duplicate registration (API 409) shows the server message inline.
- [ ] **Step 2: Run.** FAIL. **Step 3: Implement.** **Step 4: Run** the whole admin suite + `tsc --noEmit`. PASS.
- [ ] **Step 5: Browser check** with local Playwright: create a vehicle, create a driver, upload a licence. **Commit**
  `Delivery: vehicles tab (decision 0060)`; tick S7.
