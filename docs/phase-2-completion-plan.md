# Phase 2 completion — vendor module, product images, inventory

## Context

The contracted Phase 2 ("Marketplace Core") is ~80% done. The three deep pieces —
product catalog, categories, search — are complete and over-delivered. What remains
are **operational surfaces**: the schema exists, the design decisions are recorded,
but there is no code to actually use them.

Exploration of the codebase turned up more than the original gap list, including
three defects that are live today:

1. **`vendor_category` is a completely dead table.** No read path, no write path.
   Worse: `VendorCatalogExportService` lets a vendor request **any** categories —
   its own Swagger text claims scoping to "their registered categories", but nothing
   enforces it. The docs describe a control that does not exist.
2. **`vendors.city_id` is never set by anything.** Both search paths filter on it
   (`postgres-search.service.ts:101`, and the `{productId}__{cityId}` document key),
   so **every vendor is currently invisible to search**. `CityResolverService.resolveNearestCity()`
   exists for exactly this and is wired to nothing.
3. **The vendor upload silently drops two columns.** `qty_available` and `status` are
   parsed into `ParsedRow` and written to the audit blob (`rowToJson`, line 611-614),
   then never applied. A vendor typing `out_of_stock` has no effect.

Scope is **backend only** — no admin-panel or mobile work. Where a UI would be needed,
the plan delivers the API and notes the frontend dependency.

Out of scope, blocked on the ordering domain (Phase 3): vendor order views, order
status updates, and inventory decrement-on-order.

---

## Decisions taken

| Question | Decision |
|---|---|
| Image storage | S3-compatible (DigitalOcean Spaces / AWS S3 / MinIO). Endpoint + credentials are config, so the same code runs anywhere. |
| Who uploads images | **Admin only.** Decision 0009 explicitly forbids vendor-supplied imagery; vendor upload would need a new ADR, not a feature. |
| Export scoping | Wire `vendor_category` **and enforce it** on export. |
| Vendor city | Auto-suggest from lat/lng at onboarding via `resolveNearestCity()`, with an admin override. Plus a backfill for existing rows. |
| Inventory uniqueness | Partial unique index for the `warehouse_id IS NULL` case. Keeps multi-warehouse possible later. |

---

## Workstream 1 — Vendor profile CRUD + city

**Files:** `apps/backend/src/modules/vendors/` (controller, service, module, new DTOs),
`packages/types/src/vendor.types.ts`

The module today has exactly two endpoints and no way to read a profile back.

- `GET /vendors/me` — the vendor's own profile with `accountDetails` and `city`.
- `PATCH /vendors/me` — update shop name, address, lat/lng, UPI, GSTIN.
- `PATCH /vendors/me/account-details` — update bank details. `vendor_account_details.vendorId`
  is **unique**, so this is an update-or-create, never a second row.
- `GET /admin/vendors` + `GET /admin/vendors/:id` — vendor data is currently only reachable
  nested inside `GET /admin/users/:id`.
- `PATCH /admin/vendors/:id/city` — the override.

**Reuse:** extract `toVendorProfileDto()` / `toAccountDetailsDto()` from
`admin.service.ts:171` rather than writing new mappers. Follow the `resolveVendor` pattern
from `vendor-catalog-import.controller.ts:152` — but put it in `VendorsService`, since three
controllers now need it. Guards go at class level (the newer convention), not per-method.

**City wiring:** call `CityResolverService.resolveNearestCity(latitude, longitude)` inside
`createProfile()` and on address update. `CatalogModule` already exports it, and already
imports the `Vendor` model — import `CatalogModule` into `VendorsModule`, not the reverse,
to avoid a circular import.

**Two fixes to fold in while here:**
- `createProfile()` creates the vendor row and the account-details row with **no transaction**
  (`vendors.service.ts:19-57`). A failure on the second leaves an orphan vendor.
- `packages/types` `VendorProfileDto` has no `cityId` — add it.

**Deliberately NOT touching:** the duplicate `vendors.bank_details` TEXT column vs the
structured `vendor_account_details` table. Both are written today and both are exposed in
the DTO; removing the legacy column is a types change plus a migration plus a frontend
check, and belongs in its own commit.

---

## Workstream 2 — Vendor categories + export enforcement

**Files:** `apps/backend/src/modules/vendors/`, `apps/backend/src/modules/catalog/vendor-catalog-export.service.ts`

- `GET /vendors/me/categories` — what the vendor is registered for.
- `PUT /vendors/me/categories` — replace the whole set. A `PUT` fits the composite-PK join
  table better than add/remove endpoints.
- `GET /admin/vendors/:id/categories` + `PUT` equivalent for admin correction.

Validate that submitted ids are real and **leaf** categories (`category.is_leaf`), since
products only attach to leaves.

**The enforcement change:** `VendorCatalogExportService.buildWhere()` currently filters on
client-supplied `scope.leafCategoryIds` and never receives a `vendorId`. Pass the vendor
through and intersect the requested categories with their registered set — reject with a
clear 400 naming the categories they are not registered for, rather than silently narrowing.

**Migration risk worth flagging:** existing vendors have **zero** `vendor_category` rows, so
turning enforcement on would break every current export. The enforcement must treat "vendor
has no categories registered" as "unrestricted", with a `TODO` to tighten once the data is
backfilled. This is stated explicitly rather than left as a surprise.

---

## Workstream 3 — Product images

**Files:** new `apps/backend/src/modules/catalog/media/` (storage service + controller),
`apps/backend/src/modules/catalog/admin-catalog.service.ts`, new migration

`master_product_media` is fully designed already — `url`, `media_type` enum
(image/spec_sheet_pdf/certification_doc), `display_order`, `is_primary`, `is_representative`
— and has a partial unique index guaranteeing one primary per product. It has **never been
written to**. Search-sync triggers are already installed on it, so writes re-index the
product automatically.

**Storage abstraction:** a `StorageService` interface with an S3 implementation, configured
from env (`S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`,
`S3_PUBLIC_BASE_URL`). Add `@aws-sdk/client-s3`. The interface matters more than the
implementation — it keeps the swap to Spaces/MinIO a config change.

**Endpoints** (admin-only, matching the existing `@Roles(Role.ADMIN)` pattern):
- `POST /admin/catalog/products/:id/media` — multipart upload, returns the created row.
- `DELETE /admin/catalog/products/:id/media/:mediaId`
- `PATCH /admin/catalog/products/:id/media/:mediaId` — set `display_order` / `is_primary`.
- Include media in `GET /admin/catalog/products/:id` — its Swagger **already promises
  "attribute values, media and live listing count"** and does not return media. This fixes
  a documented-but-unimplemented contract.

**Upload validation — do not copy the xlsx pattern verbatim.** The existing importer accepts
`application/octet-stream` as an escape hatch, which for images would effectively disable
mime checking. Instead: sniff magic bytes, allow jpeg/png/webp only, and **set a size limit**
— `FileInterceptor` currently has none anywhere in the codebase and uses memory storage, so
uploads are bounded only by RAM.

**Migration needed:**
- Plain index on `master_product_id` (the existing unique index is partial on `is_primary`,
  so "all media for product X" has no index).
- Fix `id` default: `Sequelize.UUIDV4` → `literal('gen_random_uuid()')`. Same client-side-only
  default bug already fixed on `brand_alias` and `vendor_listing_flag`.

**Follow-on noted, not done here:** `search-document.builder.ts` does not project an image
URL, so images will not appear in search results until that field is added. Flagged rather
than bundled, since it touches the search document shape.

---

## Workstream 4 — Inventory / stock management

**Files:** `apps/backend/src/modules/catalog/` (new stock service + vendor controller),
`vendor-catalog-import.service.ts`, new migration

`inventory` has `quantity_available`, `quantity_reserved`, CHECK constraints ≥ 0, and a
search-sync trigger. It has **never been written to**, and `vendor_listing` carries no stock
column at all — by design (decision 0014 explicitly rejected adding one).

**Migration first — the uniqueness bug.** `UNIQUE (vendor_listing_id, warehouse_id)` does not
dedupe when `warehouse_id IS NULL`, because Postgres treats NULLs as distinct. Since no
warehouse is ever created, *every* row would be NULL-warehouse and duplicates could
accumulate silently. Add:

```sql
CREATE UNIQUE INDEX idx_inventory_listing_no_warehouse
  ON inventory (vendor_listing_id) WHERE warehouse_id IS NULL;
```

This matches the existing `vendor_listing_unique` precedent and makes upsert safe.

**Endpoints** (vendor-scoped, `resolveVendor` + service-layer ownership check — never trust a
`vendorListingId` from the path):
- `GET /vendor/listings` — the vendor's listings with current stock.
- `PATCH /vendor/listings/:id/stock` — set `quantity_available` (absolute, not delta).
- `PATCH /vendor/listings/:id/status` — active / paused / out_of_stock.
- `POST /vendor/listings/stock/bulk` — batch update, since a vendor with hundreds of
  listings will not click through them individually.

**Wire the import path.** In `vendor-catalog-import.service.ts` beside the `findOrCreate` at
line 235: write the `inventory` row from `row.qtyAvailable`, and apply `row.statusRaw` to the
listing status. Both are already parsed and already reach `rowToJson`. **Skip paint** —
`isPaint` is computed at line 223, and decisions 0007/0014 are explicit that paint carries
availability on `vendor_listing.status` with no inventory row.

**Leave alone:** `quantity_reserved` stays at 0 — it has no consumer until the order flow
exists, and inventing a reservation semantic now would likely be wrong.

**Follow-on noted, not done here:** `inStock: true` is hardcoded in two places
(`search-document.builder.ts:145`, `postgres-search.service.ts:212`). Once quantities are
real, both should consult inventory. Flagged separately because it changes search behaviour.

---

## Sequencing

```
1. Vendor profile CRUD + city      ← unblocks search visibility, smallest, highest value
2. Inventory + import wiring       ← closes the dropped-data bug
3. Vendor categories + enforcement ← depends on 1 for the admin endpoints
4. Product images                  ← largest; needs S3 credentials to test for real
```

1 and 2 are independent and could be done in either order. 4 is last because it is the only
one needing external infrastructure.

---

## Verification

Per this project's standing practice: **manual verification against live services with
throwaway scripts, deleted afterwards.** No new `.spec.ts` files — the 25-test suite is
frozen and protected, not grown.

Each workstream verified through real HTTP with a real admin/vendor login, using the
`ResponseInterceptor` (a harness that omits it asserts against the wrong shape — this cost a
false 14-failure run previously).

| Workstream | Must prove |
|---|---|
| 1 | Profile round-trips; `city_id` is set from lat/lng at onboarding and the vendor becomes findable in search where they were not before; a vendor cannot read another vendor's profile |
| 2 | Categories replace cleanly; export **rejects** an unregistered category; a vendor with no categories is still unrestricted |
| 3 | Upload returns a fetchable URL; the partial unique index actually refuses a second primary; a non-image file is rejected; oversized upload is rejected |
| 4 | Stock upserts rather than duplicating on repeat calls; the NULL-warehouse index holds; an upload with `qty_available` creates an inventory row; paint creates none; a vendor cannot touch another vendor's listing |

Plus, after each: `pnpm build`, the frozen 25-test suite, and `pnpm smoke` (which asserts the
app boots and routes are mapped — added after the app was found unable to start at all).

New routes get added to `scripts/smoke.js`.

---

## Explicitly out of scope

- Vendor portal UI and mobile screens — frontend, and the whole point of keeping this
  backend-only. **Worth naming: these endpoints have no consumer until someone builds that UI.**
- Product create/edit form (deferred earlier — bulk import covers seeding).
- Dropping the legacy `vendors.bank_details` column.
- Anything needing orders: vendor order views, status updates, stock decrement, risk 4.
- KYC/document upload for vendor verification — a separate discussion about what is legally
  required before paying vendors out.
