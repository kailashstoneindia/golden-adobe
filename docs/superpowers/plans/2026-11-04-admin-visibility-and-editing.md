# Admin visibility, session and editing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the 15-minute admin logout, make ustaad approval one action, and make every admin page show everything the platform knows about the record it displays, then add the edits the user picks from Part C.

**Architecture:** Backend adds admin-only DTOs that _extend_ the existing shared DTOs (never change what customers, vendors or ustaads receive). One shared `AdminContactDto` carries "who is this person" everywhere. Admin UI renders the new fields in the existing pages and modals; no new pages except where noted.

**Tech Stack:** NestJS + Sequelize (backend, Jest), React + React Query + axios (admin, Vitest + MSW), shared types in `packages/types`.

**Spec:** the 4 Nov triage artifact (items 9, 10, 14 and the refresh-token answer) plus the user's instruction of 4 Nov: "every entity or resource we show in admin, show maximum information we can" and "make a list of things we should make editable". The decision record for this work is Task 0.

## Decisions the user must make before Task 0

**Answered 2026-11-04: every recommendation accepted** (recorded in decision 0058).

| #   | Question                                                                                                                                                  | Recommendation                                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| D1  | Ustaad **Verify** also sets `users.is_approved = true`?                                                                                                   | Yes. One button, both flags, one transaction.                              |
| D2  | Ustaad **Reject verification** also sets `users.is_approved = false`? This blocks the ustaad from every `ApprovedGuard` route, not just from being hired. | Yes. A rejected ustaad should not operate.                                 |
| D3  | The separate "Ustaad approvals" tab (`/approvals/artisans`) after D1?                                                                                     | Remove the tab; redirect the route to `/artisans/verification`.            |
| D4  | Bank account numbers in admin: full or masked?                                                                                                            | Full in detail popups (needed for manual payouts), last 4 digits in lists. |
| D5  | Which rows of the Part C table to build.                                                                                                                  | The rows marked **Yes**.                                                   |

## Global Constraints

- Admin-only fields go on admin-only DTOs (`Admin*Dto`). Non-admin responses must be byte-identical before and after this plan; existing non-admin tests must pass unchanged.
- Never return or render: `passwordHash`, refresh-token values, `deviceToken` value (render "Push: on/off" only), `identityHash`.
- Every admin write logs one line: `admin <adminUserId> <action> <entity> <id> <changed field names>` via the module's Nest `Logger`.
- Signed document links expire after `DOCUMENT_PRESIGN_TTL_SECONDS` (already defined in `artisans.service.ts`); they are generated only on detail endpoints, never in lists.
- Commit per task. Each commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Branch: `feat/admin-visibility` from `main` (1e1b0d2).
- Verification per task: `pnpm --filter backend test -- <spec>`, `pnpm --filter admin test -- <spec>`, `pnpm --filter admin lint`, `pnpm --filter admin exec tsc --noEmit`, `pnpm --filter backend exec tsc --noEmit`. UI tasks also get a Playwright check (memory: verify-ui-with-playwright).

## Review Focus

1. **Two admin tabs open when the access token expires.** Both get 401. Expected: one refresh across tabs, both continue, no "reuse detected, all sessions revoked". Test in Task 1 (`uses a token another tab already refreshed`, `takes the cross-tab lock`).
2. **Refresh token itself expired (30 days) or revoked.** Expected: clean redirect to login, no loop of retries. Test in Task 1 (`refresh failure clears tokens and redirects`, `does not retry a retried request`).
3. **Ustaad with a stored document key from before S3 (legacy full URL) or a missing object.** Expected: the link still opens (URL passed through) or the popup says "file missing", never a 500. Test in Task 6 (`passes through a stored http URL`, `returns null link when no document`).
4. **Customer, vendor or ustaad whose user row is deactivated or has no phone/email.** Expected: contact block renders "—", page does not crash. Tests in Tasks 3–5 use a user with `phone: null, email: null`.
5. **Hire-request contact visibility for the ustaad must not change.** Admin sees contact in every status; the ustaad's own endpoint still hides it outside 0055's statuses. Test in Task 3 (`ustaad view still hides contact while PENDING_ADMIN_REVIEW`).

---

## File structure

| File                                                                                        | Responsibility                                                                                                       |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `apps/admin/src/services/api/tokenRefresh.ts` (new)                                         | Single-flight, cross-tab token refresh. Nothing else.                                                                |
| `apps/admin/src/services/api/apiClient.ts`                                                  | 401 → refresh → retry, using `tokenRefresh.ts`.                                                                      |
| `packages/types/src/admin.types.ts`                                                         | `AdminContactDto` and every new `Admin*Dto`.                                                                         |
| `apps/backend/src/common/mappers/admin-contact.mapper.ts` (new)                             | `toAdminContactDto(user)`. Pure function, used by every module.                                                      |
| `apps/backend/src/modules/catalog/media/object-storage.ts` + `s3-object-storage.service.ts` | Add `presignGet`.                                                                                                    |
| `apps/backend/src/modules/<module>/admin-*.mapper.ts` (new, one per module)                 | Builds that module's `Admin*Dto` from the model. Keeps admin shaping out of the shared mappers.                      |
| `apps/admin/src/components/common/ContactBlock.tsx` (new)                                   | Renders an `AdminContactDto`: name, tap-to-call phone, mailto email, active badge, last login. Reused by every page. |
| `apps/admin/src/components/common/FieldList.tsx` (new)                                      | Label/value grid used by every detail popup, renders `—` for null.                                                   |

---

## Part A — Fixes from the triage

### Task 0: Branch and decision record

**Files:**

- Create: `docs/decisions/0058-admin-visibility-and-editing.md` (from `docs/decisions/TEMPLATE.md`)
- Modify: `docs/decisions/README.md` (index line)

- [ ] **Step 1:** `git switch -c feat/admin-visibility`
- [ ] **Step 2:** Write 0058 with the answers to D1–D5, the "maximum information" rule verbatim ("every admin page shows every stored field of the record except the never-render list in Global Constraints"), and the Part C table as decided.
- [ ] **Step 3:** Commit `Docs: decision 0058, admin visibility and editing`.

### Task 1: Admin silent token refresh

**Files:**

- Create: `apps/admin/src/services/api/tokenRefresh.ts`
- Modify: `apps/admin/src/services/api/apiClient.ts:31-45` (response interceptor)
- Test: `apps/admin/src/services/api/apiClient.spec.ts` (new; MSW pattern from `mediaService.spec.ts`, server from `@/test/server`)

**Interfaces:**

- Produces: `getFreshAccessToken(staleAccessToken: string | null): Promise<string>` in `tokenRefresh.ts`.
  - One in-tab promise shared by all callers until it settles.
  - Inside, runs under `navigator.locks.request('admin-token-refresh', …)` when `navigator.locks` exists, otherwise directly.
  - Under the lock: if `tokenStorage.getAccessToken()` is non-null and differs from `staleAccessToken`, another tab already refreshed → return it without calling the API.
  - Otherwise `POST API_ENDPOINTS.auth.refresh` with `{ refreshToken }` using a **bare** `axios.post` (not `apiClient`, so no interceptor recursion), store both tokens with `tokenStorage.setTokens`, return the access token. No refresh token stored → throw.
- `apiClient` interceptor: refresh only when status is 401, the request is not already `_retry`, and the URL is not one of `auth.adminLogin`, `auth.adminRegister`, `auth.refresh`, `/auth/admin/reset-password`. Mark `_retry = true`, read the stale token from the failed request's `Authorization` header, call `getFreshAccessToken`, set the header, re-send via `apiClient`. If refresh throws: existing behaviour (clear tokens, redirect to `ROUTES.login`, reject `ApiClientError(401)`).
- Add the `_retry?: boolean` axios module augmentation as in `apps/mobile/src/api/client.ts:13-20`.

- [ ] **Step 1: Write the failing tests** in `apiClient.spec.ts`:
  - `retries a 401 once with the refreshed token` — tokens `a1/r1`; `GET /admin/stats` answers 401 for `Bearer a1`, 200 `{data:{totalUsers:3}}` for `Bearer a2`; refresh answers `{data:{accessToken:'a2',refreshToken:'r2'}}`. Expect `getRequest('/admin/stats')` → `{totalUsers:3}`, storage `a2/r2`, refresh hit count 1.
  - `parallel 401s share one refresh call` — three concurrent `getRequest`s; refresh hit count 1; all three resolve.
  - `uses a token another tab already refreshed` — `GET` handler for `Bearer a1` writes `a2/r2` to storage, then answers 401. Expect refresh hit count 0 and the retry sent `Bearer a2`.
  - `takes the cross-tab lock` — stub `navigator.locks.request = vi.fn((_n, cb) => cb())`; expect it called with `'admin-token-refresh'`.
  - `refresh failure clears tokens and redirects` — refresh answers 401. Expect rejection `ApiClientError` with `statusCode 401`, both tokens null, `window.location.assign` called with `'/login'`.
  - `does not retry a retried request` — retry also 401s. Refresh count 1, rejects, no third request.
  - `login 401 does not refresh` — `POST /auth/admin/login` 401 `{message:'Invalid credentials'}` → rejects with that message, refresh count 0, no redirect.
- [ ] **Step 2:** `pnpm --filter admin test -- apiClient` → 6 of 7 FAIL (login one may already pass).
- [ ] **Step 3:** Implement `tokenRefresh.ts` and the interceptor change.
- [ ] **Step 4:** Tests pass; `pnpm --filter admin lint` and `tsc --noEmit` clean.
- [ ] **Step 5:** Manual check: set `JWT_ACCESS_EXPIRES_IN=1m` locally, log in, wait 2 minutes with two tabs, click in both → no logout.
- [ ] **Step 6:** Commit `Admin: refresh the access token instead of logging out (decision 0058)`.

### Task 2: Ustaad Verify sets both flags (D1–D3)

**Files:**

- Modify: `apps/backend/src/modules/artisans/artisans.service.ts:372-389` (`verify`, `rejectVerification`)
- Modify: `apps/backend/src/modules/artisans/artisans.module.ts` (inject `User` model and `Sequelize` if not already present)
- Modify: `apps/admin/src/routes/AppRouter.tsx:50` (`<Navigate>` from `ROUTES.approvalsArtisans` to `ROUTES.artisanVerification`), `apps/admin/src/pages/ApprovalsPage.tsx:109` (drop the artisan branch), `apps/admin/src/pages/DashboardPage.tsx:38` (link to verification page) (D3)
- Test: `apps/backend/src/modules/artisans/__tests__/artisans.service.spec.ts`, `apps/admin/src/pages/ArtisanVerificationPage.spec.tsx`

**Interfaces:** signatures unchanged. `verify` runs in one `sequelize.transaction`: `artisans.is_verified = true` and `users.is_approved = true` where `users.id = artisan.userId`. `rejectVerification` likewise sets both false (if D2 = yes).

- [ ] **Step 1: Failing tests** in `artisans.service.spec.ts`:
  - `verify sets artisan.isVerified and user.isApproved` — both true after.
  - `verify without a document changes neither flag` — throws `BadRequestException`, both unchanged.
  - `rejectVerification clears both flags` — start both true, both false after.
  - `verify rolls back when the user update fails` — spy `User.update` to throw; artisan `isVerified` still false.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Admin: remove tab + redirect; update `ArtisanVerificationPage.spec.tsx` assertion that Verify success copy reads "Verified and approved".
- [ ] **Step 6:** Commit `Ustaads: Verify approves the account too (decision 0058)`.

### Task 3: Shared contact type + hire requests show both parties

**Files:**

- Modify: `packages/types/src/admin.types.ts`
- Create: `apps/backend/src/common/mappers/admin-contact.mapper.ts` + `__tests__/admin-contact.mapper.spec.ts`
- Create: `apps/backend/src/modules/artisans/admin-hire-request.mapper.ts`
- Modify: `apps/backend/src/modules/artisans/hire-requests.service.ts` (`listPendingAdminReview`, `listAll`: include `customer` and `artisan.user`, `adminReviewer`), `admin-artisans.controller.ts` (return types)
- Create: `apps/admin/src/components/common/ContactBlock.tsx`, `FieldList.tsx`
- Modify: `apps/admin/src/pages/ArtisanHireRequestsPage.tsx`, `ArtisanHireRequestsTrackingPage.tsx`
- Tests: `hire-requests.service.spec.ts`, `admin-artisans.controller.spec.ts`, both page specs

**Interfaces (Produces):**

```ts
export type AdminContactDto = {
  userId: string;
  name: string;
  phone: string | null;
  email: string | null;
  role: Role;
  isActive: boolean;
  isApproved: boolean;
  lastLoginAt: string | null;
};
// User ruling 2026-11-04: no ustaad email in hire requests.
export type AdminContactWithoutEmailDto = Omit<AdminContactDto, 'email'>;
export type AdminHireRequestDto = ArtisanHireRequestDto & {
  customer: AdminContactDto | null;
  artisan: AdminContactWithoutEmailDto | null;
  artisanTradeType: TradeType | null;
  adminReviewerName: string | null;
  estimateCount: number;
};
```

- `toAdminContactDto(user: User | null | undefined): AdminContactDto | null` in `admin-contact.mapper.ts`.
- `toAdminHireRequestDto(request: ArtisanHireRequest, capacity?): AdminHireRequestDto` — calls existing `toHireRequestDto`, then sets `customerName/customerPhone` from the customer regardless of status (admin always sees).
- `ContactBlock({ contact, title }: { contact: AdminContactDto | null; title: string })`; `FieldList({ rows }: { rows: [label: string, value: ReactNode][] })`.

- [ ] **Step 1: Failing tests:**
  - mapper: `maps a user to a contact`, `returns null for a missing user`, `keeps null phone and email`.
  - service: `admin list includes customer and ustaad contact in every status` (one request per status in 0055's enum).
  - service: `ustaad view still hides contact while PENDING_ADMIN_REVIEW` (regression for `listForArtisan`).
  - page: list row shows customer name + phone and ustaad name + phone; detail shows reviewer name, estimate count, all timestamps.
  - service: `admin hire request never carries the ustaad's email` (`'email' in dto.artisan` is false).
- [ ] **Step 2–4:** fail → implement → pass.
- [ ] **Step 5:** Commit `Admin: hire requests show customer and ustaad contact (decision 0058)`.

### Task 4 (user ruling 2026-11-04): server approval gate, friendly labels, robust old tests, then orders

Task 4 runs as four steps: 4a, 4b, 4c, 4d. 4a is reviewed alone, 4b and 4c together, 4d alone.

#### Task 4a: Server-side approval gate (decision 0059, follow-up F1)

**Files:**

- Create: `apps/backend/src/common/decorators/allow-unapproved.decorator.ts`
- Modify: `apps/backend/src/common/guards/approved.guard.ts`, `common/filters/global-exception.filter.ts` (pass `code` through)
- Modify: the five controllers in 0059 §1, adding the guard at class level and `@AllowUnapproved()` on the 0059 §3 routes
- Modify: `catalog.module.ts`, `orders.module.ts` (import `UsersModule`)
- Test: `apps/backend/src/common/guards/__tests__/approved.guard.spec.ts` (unit), plus HTTP tests in `artisans/__tests__/artisans.controller.spec.ts` and the vendor controller spec

**Interfaces:** `AllowUnapproved = () => SetMetadata(ALLOW_UNAPPROVED_KEY, true)`. The guard throws `ForbiddenException({ message, code: 'ACCOUNT_NOT_APPROVED' })`.

- [ ] Tests:
  - unit: customer and admin pass; approved vendor passes; unapproved vendor gets 403 with the code; `@AllowUnapproved` route passes when unapproved; a user deleted mid-session gets 403.
  - HTTP: a pending ustaad can create and read their profile but gets 403 on `GET /artisans/me/hire-requests`; approving them opens it with no new login; a pending vendor can `GET /vendors/me` but gets 403 on `GET /vendor/listings` and `GET /vendors/order-groups`.

#### Task 4a-G1: Hide unapproved vendors from search and checkout (0059 G1, option A)

Done in the 4a review cycle: approval filter in the search document builder, Postgres search, other-sellers list and checkout (`sellerBlockReason`); migration `20261105090000` adds a `users.is_approved` trigger that queues re-indexing. Tests: `search/__tests__/unapproved-vendor-hidden.spec.ts`, `orders/__tests__/checkout-line-rules.spec.ts`.

#### Task 4b: Friendly labels on admin pages (follow-up F10)

One `apps/admin/src/utils/labels.ts` with `formatTradeType`, `formatHireRequestStatus`, `formatOrderStatus`, `formatVendorGroupStatus`, `formatListingStatus`. Every admin page renders through it. Unknown codes fall back to the raw code. Tests: each map covers every value of its union type (type-checked with `satisfies Record<…>`), and the pages show labels.

#### Task 4c: Robust older hire-request tests (follow-up F11)

The older `listPendingAdminReview(1, 20)` and `listAll(1, 20)` lookups in `hire-requests.service.spec.ts` and `admin-artisans.controller.spec.ts` find their row without depending on how many other rows exist (limit 100 plus a lookup by id, or a `status` filter).

#### Task 4d: Orders show who, and every payment fact

**Files:**

- Modify: `packages/types/src/admin.types.ts`
- Create: `apps/backend/src/modules/orders/admin-order.mapper.ts`
- Modify: `apps/backend/src/modules/orders/orders.service.ts:399-415` (`listForAdmin`, `getForAdmin` return `AdminOrderDto`), the `ADMIN_ORDER_DISPLAY_INCLUDE` constant (add `customer → user`, `vendorGroups → vendor → user`), `refunds.service.ts` `listForOrder` (admin variant adds `createdByName`)
- Modify: `apps/admin/src/pages/OrdersPage.tsx`, `components/orders/OrderDetailModal.tsx`
- Tests: `orders.service.spec.ts`, `refunds.service.spec.ts`, `OrdersPage.spec.tsx`

**Interfaces (Produces):**

```ts
export type AdminOrderVendorGroupDto = OrderVendorGroupDto & { vendor: AdminContactDto | null };
export type AdminOrderDto = Omit<OrderDto, 'vendorGroups'> & {
  customer: AdminContactDto | null;
  customerFullName: string | null; // customers.full_name
  vendorGroups: AdminOrderVendorGroupDto[];
  itemCount: number;
  hireRequestId: string | null; // = bookingId, linked in UI
};
export type AdminRefundDto = RefundDto & {
  createdByName: string | null;
  payoutReference: string | null;
};
```

UI: list gets columns Customer (name, phone), Paid (capturedPaise as ₹), Payment id. Detail gets Customer block, vendor block per group, Razorpay order + payment ids (copy buttons), booking → hire request link, delivery address with lat/lng → `https://maps.google.com/?q=lat,lng`, payment events with a collapsible raw JSON, refunds with rail, receipt, Razorpay refund id, payout reference, created by.

- [ ] **Step 1: Failing tests:** `admin order carries customer and vendor contact`, `customer view (getForCustomer) is unchanged` (deep-equal against a snapshot of the current DTO keys), `admin refund shows who created it`, page `renders customer phone and paid amount`.
- [ ] **Step 2–4:** fail → implement → pass.
- [ ] **Step 5:** Commit `Admin: orders show customer, vendor and payment details (decision 0058)`.

## Part B — Maximum information per entity

Gap table (what is stored but not shown today):

| Entity / page                        | Missing today                                                                                                                                                                |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Users** list + popup               | email, active flag, onboarding stage in list; sessions, push on/off; customer name and addresses; counts of orders and hire requests                                         |
| **Vendors** list + popup             | owner name/phone/email, lat/lng, UPI, bank account details, legacy bank text, min order value, loading team, warehouses, listings and stock, open listing flags, order count |
| **Ustaads** directory + verification | owner name/phone/email, approved flag, bank account number, document links (own + team), team in verification popup, job counts                                              |
| **Hire requests**                    | Task 3                                                                                                                                                                       |
| **Orders**                           | Task 4                                                                                                                                                                       |
| **Catalog product** popup            | description, family, stone variety, unit, sale unit type, pack qty, natural variation, importer details, best price + which vendor, vendor listings for this product         |

### Task 5: Vendors

**Files:** `packages/types/src/admin.types.ts`; create `apps/backend/src/modules/vendors/admin-vendor.mapper.ts`; modify `vendors.service.ts` (`listVendors`, `getVendorById` → admin variants `listForAdmin`, `getForAdmin`), `admin-vendors.controller.ts` (+ `GET :id/listings`); modify `apps/admin/src/pages/VendorsPage.tsx`, `components/vendors/VendorDetailModal.tsx`, `queries/useVendorsQueries.ts`, `services/api/vendorsService.ts`, `constants/apiEndpoints.ts`. Tests: `vendors/__tests__/admin-vendors.controller.spec.ts`, new `VendorDetailModal.spec.tsx`.

**Interfaces (Produces):**

```ts
export type AdminVendorDto = VendorProfileDto & {
  owner: AdminContactDto | null;
  categoryCount: number;
  listingCounts: { active: number; paused: number; outOfStock: number };
  openFlagCount: number;
  orderGroupCount: number;
  warehouses: { id: string; name: string; address: string | null; isActive: boolean }[];
};
export type AdminVendorListingDto = {
  id: string;
  masterProductId: string;
  productName: string;
  productCode: string;
  vendorSku: string | null;
  price: number;
  mrp: number | null;
  minOrderQty: number | null;
  statedGrade: string | null;
  status: 'active' | 'paused' | 'out_of_stock';
  quantityAvailable: number | null;
  openFlags: string[];
  updatedAt: string;
};
// GET /admin/vendors/:id/listings?status&page&limit → PaginatedResponse<AdminVendorListingDto>
```

Counts are computed with grouped `COUNT` queries, not by loading rows. Popup sections in this order: Owner · Shop · Location · Payout · Commercial · Status · Categories · Warehouses · Listings (paged table, status filter).

- [ ] Tests: `admin vendor list includes owner contact and listing counts`, `listings endpoint pages and filters by status`, `listings endpoint 404s for unknown vendor`, `vendor's own GET /vendors/me is unchanged`, modal `renders payout section with full account number` (D4), list `shows last 4 digits only`.
- [ ] fail → implement → pass → Playwright check → commit `Admin: vendors show owner, payout, warehouses and listings (decision 0058)`.

### Task 6: Ustaads + viewable documents

**Files:** `object-storage.ts` (+ `presignGet`), `s3-object-storage.service.ts`, `artisans/__tests__/fake-object-storage.ts`, `apps/backend/package.json` (add `@aws-sdk/s3-request-presigner` at the same `^3.1146.0` line as `client-s3`); create `artisans/admin-artisan.mapper.ts`; modify `artisans.service.ts` (admin list + `getForAdmin`), `admin-artisans.controller.ts`; admin `ArtisansPage.tsx`, `ArtisanVerificationPage.tsx`, `services/api/artisansService.ts`. Tests: `artisans.service.spec.ts`, `admin-artisans.controller.spec.ts`, both page specs.

**Interfaces (Produces):**

```ts
// ObjectStorage
presignGet(key: string, expiresInSeconds: number): Promise<string>;

export type AdminArtisanTeamMemberDto = ArtisanTeamMemberDto & { documentViewUrl: string | null };
export type AdminArtisanDto = Omit<ArtisanProfileDto, 'team'> & {
  owner: AdminContactDto | null;
  team: AdminArtisanTeamMemberDto[];
  documentViewUrl: string | null;          // null in list responses; set on GET /admin/artisans/:id
  jobCounts: { active: number; completed: number; declined: number; total: number };
};
```

`documentViewUrl` rule: stored value null → null; starts with `http` → returned as-is (legacy); otherwise `presignGet(key, DOCUMENT_PRESIGN_TTL_SECONDS)`. Both pages open the same detail popup (fetches `GET /admin/artisans/:id` on open). Documents open in a new tab.

- [ ] Tests: `detail returns a signed link for the ustaad document`, `detail returns a signed link per team member document`, `passes through a stored http URL`, `returns null link when no document`, `list responses never sign`, `job counts by status`, page `verification popup shows owner phone, team and View document links`.
- [ ] fail → implement → pass → Playwright → commit `Admin: ustaads show owner, team and openable documents (decision 0058)`.

### Task 7: Users and customers

**Files:** `packages/types/src/admin.types.ts`; `admin/admin.service.ts` (`listUsers`, `getUserById`), new `admin/admin-user.mapper.ts`; `admin.module.ts` (inject `Customer`, `CustomerAddress`, `Order`, `ArtisanHireRequest`, `RefreshToken` models); admin `UsersPage.tsx`, `components/approvals/UserDetailModal.tsx`. Tests: new `admin/__tests__/admin.service.users.spec.ts`, `UserDetailModal.spec.tsx`.

**Interfaces (Produces):**

```ts
export type AdminUserDetailDto = Omit<UserDto, 'deviceToken'> & {
  pushEnabled: boolean;
  activeSessionCount: number; // refresh tokens not revoked and not expired
  customerProfile: null | {
    fullName: string | null;
    addresses: CustomerAddressDto[];
    orderCount: number;
    paidTotalPaise: number; // sum of captured_paise
    hireRequestCount: number;
  };
};
```

`listUsers` items drop `deviceToken` and add `pushEnabled`. List columns gain email, active, onboarding stage. Popup links: customer orders → Orders page filtered by customer id (add `?customerId=` to `GET /admin/orders`), vendor → vendor popup, ustaad → ustaad popup.

- [ ] Tests: `user detail never contains deviceToken`, `counts only live sessions`, `customer profile with addresses and totals`, `non-customer has null customerProfile`, `orders filter by customerId`.
- [ ] fail → implement → pass → Playwright → commit `Admin: users show sessions, push and customer profile (decision 0058)`.

### Task 8: Catalog product popup

**Files:** backend admin product detail (`admin-catalog.controller.ts:62` → its service method), `apps/admin/src/types/catalog.types.ts` `ProductDetail`, `components/catalog/ProductDetailModal.tsx`. Test: the product-detail service spec beside the service, new `ProductDetailModal.spec.tsx`.

**Interfaces:** `ProductDetail` gains `description`, `productFamily: string | null`, `stoneVariety: string | null`, `unitOfMeasure: string | null`, `saleUnitType`, `packContentQty: number | null`, `hasNaturalVariation`, `importerDetails: string | null`, `cachedBestPrice: number | null`, `cachedBestVendorName: string | null`, `listings: { vendorId; shopName; price; mrp; status; quantityAvailable }[]`.

- [ ] Tests: `detail includes family, unit and listings by vendor`; modal renders each new field.
- [ ] fail → implement → pass → commit `Admin: product popup shows full product and vendor listings (decision 0058)`.

## Part C — What should be editable (proposal for D5)

Rule of thumb used: admins edit **profile and operational** data people get wrong or ask support to fix. Admins never edit **money that already moved, history, or identity keys**.

| Entity         | Field / action                                                              | Build?  | Why                                                                 |
| -------------- | --------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------- |
| User           | name, email, phone                                                          | **Yes** | Support fixes typos. Phone must stay unique (it is the login).      |
| User           | Deactivate / reactivate (`is_active`)                                       | **Yes** | Stop a bad actor without deleting data.                             |
| User           | Sign out everywhere (revoke refresh tokens)                                 | **Yes** | Pairs with deactivate; lost phone.                                  |
| User           | Role                                                                        | No      | Changing role orphans the profile rows.                             |
| Vendor         | shop name, address, lat/lng, GSTIN, UPI                                     | **Yes** | Onboarding typos, wrong pin.                                        |
| Vendor         | bank account details                                                        | **Yes** | Needed before manual payouts.                                       |
| Vendor         | min order value, loading team                                               | **Yes** | Commercial setting admins negotiate.                                |
| Vendor         | city, categories, approve/reject                                            | exists  | Already built.                                                      |
| Vendor listing | pause / reactivate                                                          | **Yes** | Pull a wrong or flagged listing fast.                               |
| Vendor listing | price, stock                                                                | No      | Vendor owns price and stock.                                        |
| Ustaad         | trade, experience, bio, service pincode, available                          | **Yes** | Same reason as vendor profile.                                      |
| Ustaad         | bank account details                                                        | **Yes** | Payouts.                                                            |
| Ustaad         | team members: edit, remove                                                  | **Yes** | Wrong member on file.                                               |
| Ustaad         | upload a document on their behalf                                           | Later   | Needs admin upload flow; low demand.                                |
| Customer       | full name, addresses                                                        | Later   | Customer can do it in the app.                                      |
| Hire request   | admin cancel with reason                                                    | **Yes** | Today only customer/ustaad can cancel.                              |
| Hire request   | reassign to another ustaad                                                  | No      | New request is cleaner; keeps history true.                         |
| Order          | delivery address                                                            | No      | Snapshot integrity; vendor already dispatched against it.           |
| Order          | cancel, refund, group status override                                       | exists  | Already built.                                                      |
| Catalog        | categories (name, active, order), brands, cities active                     | Check   | Depends on what the catalog pages already edit; checked in Task 13. |
| Never          | ids, amounts, captured paise, payment events, refunds, timestamps, password | No      | History and money.                                                  |

### Tasks 9–13 (shape fixed now, fields per D5)

Every edit task follows the same pattern, so each is specified by its endpoint and DTO only:

- Backend: `PATCH` endpoint under the existing admin controller, a `class-validator` DTO whitelisting exactly the D5 fields (all optional, `forbidNonWhitelisted`), service method that updates, logs the Global Constraints line, returns the Task 5–7 admin DTO.
- Admin: "Edit" button in the existing popup switches the section to a form; save → mutation → invalidate the list and detail queries.
- Tests per task: `updates only whitelisted fields`, `rejects unknown field`, `404 unknown id`, `403 for non-admin`, `logs the admin action`, plus one UI spec `edit and save updates the popup`.

| Task             | Endpoint(s)                                                                                                                                                     | Notes                                                                                            |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 9 Users          | `PATCH /admin/users/:id`, `PATCH /admin/users/:id/active`, `POST /admin/users/:id/revoke-sessions`                                                              | Phone unique → 409 on clash. Deactivate also revokes sessions.                                   |
| 10 Vendors       | `PATCH /admin/vendors/:id`, `PUT /admin/vendors/:id/account-details`, `PATCH /admin/vendor-listings/:id/status`                                                 | Reuse onboarding DTO validators for GSTIN, IFSC.                                                 |
| 11 Ustaads       | `PATCH /admin/artisans/:id`, `PUT /admin/artisans/:id/account-details`, `PATCH /admin/artisans/:id/team/:memberId`, `DELETE /admin/artisans/:id/team/:memberId` | Reuse the ustaad's own DTO validators.                                                           |
| 12 Hire requests | `PATCH /admin/artisans/hire-requests/:id/cancel`                                                                                                                | Uses the existing conditional-update cancel path in `hire-requests.service.ts`; reason required. |
| 13 Catalog       | decided after reading the catalog pages                                                                                                                         | Only the gaps.                                                                                   |

## Execution order and review gates

```
0 → 1 → 2 → 3 → 4a → 4b → 4c → 4d → 5 → 6 → 7 → 8 → (D5) → 9 → 10 → 11 → 12 → 13 → whole-branch review → PR
```

After each task: tests + lint + typecheck green, a fresh reviewer checks the task's diff against this plan, then the user OKs before the next task starts.

## Release (only after every task above, user ruling 2026-11-05)

Merge and deploy happen once, after all tasks are done and the backend is in sync with the
mobile developer's `feat/artisan-mobile`. Each production step needs the user's go-ahead.
Ask the merge method before merging.

- [x] Whole-branch review (done 2026-11-05; its findings are fixed). Then a PR for `feat/admin-visibility`.
- [ ] Mobile sync. The mobile artisan app is already in `main` (PR #36); `apps/mobile` is
      untouched by this branch. Tell the mobile developer (their side, nothing for us to build): - `403 ACCOUNT_NOT_APPROVED` is not handled (a vendor or ustaad rejected mid-session). - Adding an unapproved vendor's item to the cart returns `400 "This seller is not taking
      orders right now"`. - OTP verify returns `401 "Account is deactivated"` for a deactivated account. - `PATCH /artisans/me/profile` now rejects `experienceYears` over 80 and `servicePincode`
      over 10 characters (400); the onboarding screen has the same limits to add (F35). - `PATCH /users/:id/approve` (admin-only, unused) was removed.
- [ ] Deploy latest main to production. Migrations run by themselves in
      `apps/backend/docker-entrypoint.sh` before the app starts, including `20261105090000`
      (approval trigger) and `20261105090100` (queue already-unapproved vendors).
- [ ] Optional, before deploy: list rows the gate will now act on (prod is test data):
      `artisans.is_verified <> users.is_approved`, and `vendors.status = 'APPROVED'` against
      `users.is_approved` (either way round).
- [ ] If a deploy is rolled back after migrations ran: the older image's outbox drain can process
      the `20261105090100` backfill rows without the approval filter, leaving unapproved vendors in
      Meilisearch. After the next good deploy, re-run that migration's `INSERT ... SELECT` by hand.
- [ ] Production media env vars: `S3_MEDIA_BUCKET`, `AWS_REGION`, `MEDIA_PUBLIC_BASE_URL`
      (CloudFront), `MEDIA_CALLBACK_SECRET` (32+ characters). `S3_ACCESS_KEY_ID` and
      `S3_SECRET_ACCESS_KEY` only if not on AWS. Without these, ustaad document upload
      returns 503.
- [ ] Deploy `apps/media-lambda` (product images never reach "ready" without it).
- [ ] Razorpay on the backend: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`,
      `RAZORPAY_WEBHOOK_SECRET`. Send the key ID to the mobile developer for the app build.
- [ ] After deploy: wait for `SELECT count(*) FROM search_outbox WHERE processed_at IS NULL` to
      reach 0 (only when `SEARCH_ENGINE=meilisearch`), then confirm search shows only approved vendors.
