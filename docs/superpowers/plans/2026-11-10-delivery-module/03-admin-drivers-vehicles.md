# S3: Admin API for drivers and vehicles

Spec: "Data model", rules 11-12. Needs S1. Pattern to copy: `modules/artisans/admin-artisans.service.ts` and
`modules/admin/admin.controller.ts` (guards, `@Roles(Role.ADMIN)`, pagination).

**Endpoints** (all `@Roles(Role.ADMIN)`, controller prefix `admin`):
`POST/GET /admin/vehicles`, `PATCH /admin/vehicles/:id` · `POST/GET /admin/drivers`, `GET/PATCH /admin/drivers/:id` ·
`POST /admin/drivers/:id/document-upload-url` `{kind:'licence'|'aadhaar', contentType}` ·
`POST /admin/drivers/:id/documents/confirm` `{kind, key}`.
Deactivate/reactivate a driver with the existing `PATCH /admin/users/:id/active` (no new endpoint).

**Produces** (add to `packages/types/src/delivery.types.ts`):
```ts
VehicleDto { id; registrationNumber; type; notes: string|null; isActive }
AdminDriverDto { id; userId; name; phone; isActive; licenceNumber; helperName: string|null; helperPhone: string|null;
  vehicle: VehicleDto|null; licenceDocViewUrl: string|null; aadhaarDocViewUrl: string|null }
```
Services in `modules/delivery/`: `VehiclesService` (`create`, `list`, `update`), `DriversService`
(`create(dto): Promise<AdminDriverDto>`, `list(query)`, `get(id)`, `update(id, dto)`, `createDocumentUploadUrl(id, kind, contentType)`,
`confirmDocument(id, kind, key)`).

## Task 1: Vehicles

- [ ] **Step 1: Write failing tests** `__tests__/vehicles.service.spec.ts`: create returns dto; duplicate
  `registrationNumber` (case-insensitive, store uppercased) → 409 Conflict; update changes `type`/`isActive`; list returns all.
- [ ] **Step 2: Run** `... test -- vehicles.service`. Expected: FAIL.
- [ ] **Step 3: Implement** `VehiclesService` + `AdminVehiclesController` + DTOs, register in `DeliveryModule`.
- [ ] **Step 4: Run.** Expected: PASS. **Step 5: Commit** `Delivery: vehicles admin API (decision 0060)`.

## Task 2: Create and read drivers

- [ ] **Step 1: Write failing tests** `__tests__/drivers.service.spec.ts`: `create({name, phone:'+919876543210', licenceNumber,
  helperName?, helperPhone?, vehicleId?})` runs in one transaction creating a `User` (role `DRIVER`, `isApproved: true`,
  `isActive: true`) and a `Driver`; phone already used by any user → 409 and nothing created; bad phone (not
  `^\+91[6-9]\d{9}$`, same rule as `/auth/otp/send`) → 400; unknown or inactive `vehicleId` → 400; a vehicle already
  assigned to another driver → 409; `get(id)` returns `AdminDriverDto` with `vehicle` expanded.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement** `DriversService.create/list/get` + `AdminDriversController`.
- [ ] **Step 4: Run.** Expected: PASS. **Step 5: Commit** `Delivery: create and read drivers (decision 0060)`.

## Task 3: Update driver (helper, vehicle, licence)

- [ ] **Step 1: Write failing tests:** `update(id, {helperName, helperPhone})` persists; `helperName` without `helperPhone`
  → 400 (both or neither); `vehicleId: null` unassigns; changing name/phone updates the linked `users` row too
  (phone uniqueness enforced → 409).
- [ ] **Step 2: Run.** FAIL. **Step 3: Implement** `update`. **Step 4: Run.** PASS. **Step 5: Commit** `Delivery: update drivers (decision 0060)`.

## Task 4: Driver documents

- [ ] **Step 1: Write failing tests** (mock `OBJECT_STORAGE` as in `artisans.service.spec.ts`): `createDocumentUploadUrl`
  returns a presigned post whose key starts `drivers/<id>/licence-` (or `aadhaar-`); content type other than
  pdf/jpeg/png → 400; `confirmDocument` with a key outside `drivers/<id>/<kind>-` → 400; with a key that `head()`
  says does not exist → 400; valid key stores `licenceDocKey`/`aadhaarDocKey`; `get(id)` returns `*DocViewUrl` from `presignGet`.
- [ ] **Step 2: Run.** FAIL. **Step 3: Implement** mirroring `ArtisansService.createUploadUrl/confirmDocumentUpload`
  (`artisans.service.ts:160-215`) and `admin-artisans.service.ts:290`. **Step 4: Run.** PASS.
- [ ] **Step 5: Commit** `Delivery: driver documents (decision 0060)`.

## Task 5: Driver login and registration guard

**Files:** Modify role-enumerating code found with `grep -rn "Role.ARTISAN" apps/backend/src` (auth, users, admin
mappers); Test `modules/auth/__tests__/` (extend).

- [ ] **Step 1: Write failing tests:** `/auth/register` with `role: 'DRIVER'` → 400 `DRIVER role cannot be self-selected`;
  `verifyOtp` for an existing DRIVER user returns tokens (no onboarding token); `getProfile` for a DRIVER returns the user without crashing;
  `GET /admin/users?role=DRIVER` lists drivers.
- [ ] **Step 2: Run.** FAIL. **Step 3: Implement** (extend the `ADMIN` self-select block at `auth.service.ts:188`; add DRIVER to any role switch).
- [ ] **Step 4: Run** full backend suite. PASS. **Step 5: Commit** `Delivery: driver login, block self-registration (decision 0060)`; tick S3.
