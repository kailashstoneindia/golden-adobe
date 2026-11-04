# 0059 — Server-side approval gate for vendors and ustaads

- **Date:** 2026-11-04
- **Status:** Accepted (implementing on `feat/admin-visibility`, Task 4a)
- **Supersedes / Superseded by:** Resolves follow-up F1 of
  [0058](0058-admin-visibility-and-editing.md). Builds on the approval flags of 0048 (vendors)
  and 0058 §2/§3b (ustaads).

## Context

Vendors and ustaads need an admin's approval (`users.is_approved`) before they can do
business on the platform. `ApprovedGuard`
([approved.guard.ts](../../apps/backend/src/common/guards/approved.guard.ts)) was written for
this but no route applied it. Only the mobile app enforced approval, by sending a pending user
to its "pending approval" screen. Any client calling the API directly — or an old app build —
could list products, change stock, update order status or accept jobs while unapproved or
after being rejected. The user ruled on 2026-11-04: "we must have server side check".

## Options considered

### Option A — Opt-in: tag each business route with the guard

- **Pro:** Smallest change per route; easy to read on each handler.
- **Con:** Every route added later must remember the tag. A forgotten tag is a silent hole —
  the failure mode that created F1 in the first place.

### Option B — Locked by default per controller, onboarding routes opt out (chosen)

The guard sits on every controller that vendors or ustaads use. Routes they need *before*
approval are marked `@AllowUnapproved()`.

- **Pro:** A new route is locked unless someone deliberately opens it. A forgotten tag fails
  closed (a 403 an admin or developer will notice), not open.
- **Con:** A new onboarding route must remember to opt out, or onboarding breaks. Mitigated by
  tests that call every onboarding route as a pending user.

### Option C — Global guard (`APP_GUARD`)

- **Con:** Global guards run before the per-controller `JwtAuthGuard`, so the user isn't known
  yet. It would need reordering of all auth, a bigger change than the problem.

## Decision

1. `ApprovedGuard` runs on these controllers, after `JwtAuthGuard` and `RolesGuard`:
   - the ustaad controller (`/artisans`);
   - the vendor controller (`/vendors`);
   - vendor listings (`/vendor/listings`);
   - vendor catalog import (`/vendor/catalog-import`);
   - customer/ustaad orders (`/orders`, `/checkout`).
2. It only judges **vendors and ustaads**. Customers and admins always pass. Approval is read
   from the database on each request, so approving or rejecting takes effect immediately, not
   at the next login.
3. **Open while pending** (marked `@AllowUnapproved()`):

| Who | Routes |
|---|---|
| Ustaad | `POST/GET/PATCH /artisans/me/profile`, `PUT /artisans/me/account-details`, `POST /artisans/me/documents/upload-url`, `POST /artisans/me/documents/confirm`, `POST/PATCH/DELETE /artisans/me/team…`. Browsing (`GET /artisans`, `GET /artisans/:id/public`) is open to any signed-in user. |
| Vendor | `POST /vendors/onboard`, `GET/PATCH /vendors/me`, `PATCH /vendors/me/account-details`, `PATCH /vendors/onboarding-progress`, `GET /vendors/me/categories` |
| Everyone | All `/auth/*` routes and push-token registration (these controllers don't carry the guard) |

4. **Locked until approved:** everything else on those controllers. For an ustaad that's their
   hire requests (list, accept, decline, estimates, start, complete, cancel, linked orders).
   For a vendor it's listings and stock, catalog import/export, and order groups.
5. A locked call answers **403** with `code: "ACCOUNT_NOT_APPROVED"` in the error body, so
   clients can tell it apart from other 403s.

## Why

Approval is a business rule, so the server must enforce it. Client-only checks don't survive
an old app build or a direct API call. Locked-by-default puts the cost of a mistake on the
safe side.

## Consequences

- An ustaad rejected mid-job can't finish it in the app. The admin cancels it (0058 Part C,
  admin cancel).
- The mobile developer must handle `ACCOUNT_NOT_APPROVED` (send the user to the pending
  screen). Normal use shouldn't hit it, because the app already routes pending users there.
- `CatalogModule` and `OrdersModule` import `UsersModule` so the guard can read approval.
- One extra indexed read of `users` per vendor/ustaad request on these controllers (`JwtStrategy` already reads the user once; see G2).

## Review outcomes (2026-11-04)

- Only a **route** can be opened. The guard ignores a class-level `@AllowUnapproved()`, so a
  tag above a controller can't open every route on it at once.
- A test finds every controller automatically and fails if one that vendors or ustaads can
  reach doesn't carry the gate. Exceptions are listed by name: `AuthController`,
  `UsersController`.
- A locked call answers `{ statusCode: 403, error: "Forbidden", code: "ACCOUNT_NOT_APPROVED" }`.

## Open follow-ups

| # | Item | Found in | Why not now |
|---|---|---|---|
| G1 | **Done (option A, ruled 2026-11-04).** A rejected vendor's live listings used to stay in search and could still be bought, but the vendor now gets 403 on their order groups, so those orders sit unseen. Search and checkout filter on listing status and city, not on vendor approval. | 4a review | Built: search (both engines, including other sellers) and checkout leave out listings of a vendor whose account is not approved; approving brings them back, nothing is paused or deleted. A trigger on `users.is_approved` queues the vendor's products for re-indexing. The cart still accepts the item (decision 0042: checkout is the gate). Deploy: run migrations `20261105090000` (trigger) and `20261105090100` (queues vendors already unapproved before the trigger existed). |
| G2 | Each gated vendor/ustaad request reads `users` twice (`JwtStrategy` and the guard). | 4a review | Performance only. Fix by returning `isApproved` from `JwtStrategy.validate`. |
| G3 | There are no HTTP-level gate tests for vendor listings, catalog import or orders. The unit, wiring and discovery tests cover them. | 4a review | Low risk; the vendor listings test app doesn't exist yet. |
| G4 | The checkout query's new `vendor_is_approved` column is tested only through the `sellerBlockReason` rule, not through a real checkout. If the column were lost, every line would be refused (fails closed, so it would be noticed). | G1 review | No checkout test harness exists yet. Add one when checkout is next touched. |
| G5 | Orders placed before a vendor is rejected, or between checkout and payment, are still confirmed, but the rejected vendor can't see them (403 on order groups). | G1 review | Needs a product ruling: who fulfils them (admin reassigns, cancels and refunds, or re-approves)? |
| G6 | A **deactivated** vendor (`users.is_active = false`) still appears in search, though checkout refuses them. | G1 review | Existed before this work; same fix as G1 if wanted. |
| G7 | The cart still shows an unapproved or paused vendor's item as available until checkout refuses it. | G1 review | Decision 0042 makes checkout the gate and lists this as an open question there. |
